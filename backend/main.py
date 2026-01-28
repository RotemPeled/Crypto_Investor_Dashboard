import os
import re
import json
import random
import hashlib
from pathlib import Path
from datetime import datetime, timedelta, date
import time

import jwt
import bcrypt
import httpx
from dotenv import load_dotenv
from sqlalchemy import text
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import init_db, engine

PRICE_CACHE = {}  # key -> (ts, data)
PRICE_TTL = 60

# =========================================================
# App bootstrapping
# =========================================================
load_dotenv()
app = FastAPI()

bearer = HTTPBearer()

DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"
MEMES_FILE = os.getenv("MEMES_FILE", str(Path(__file__).with_name("memes.json")))
MEME_CATALOG: list[dict] = []

# Allowed sets (kept at module-level so it's consistent across endpoints)
ALLOWED_INVESTOR_TYPES = {"long_term", "short_term", "nft_collector", "swing_trader", "defi_yield"}
ALLOWED_CONTENT_TYPES = {"market_news", "charts", "fun", "development", "regulation", "security", "social"}
ALLOWED_DASHBOARD_SECTIONS = {"prices", "news", "ai_insight", "meme", "chart", "fun"}  # used by refresh + votes


def _parse_origins() -> list[str]:
    """
    ALLOW_ORIGINS="http://localhost:5173,https://your-frontend.vercel.app"
    """
    raw = os.getenv("ALLOW_ORIGINS", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    # Initializes DB schema (your init_db uses schema.sql)
    init_db()
    load_meme_catalog()


# =========================================================
# Request models
# =========================================================
class SignupReq(BaseModel):
    name: str
    password: str
    email: str


class LoginReq(BaseModel):
    email: str
    password: str


class OnboardingReq(BaseModel):
    crypto_assets: list[str]
    investor_type: str
    content_type: list[str]


class VoteReq(BaseModel):
    dashboard_id: int
    section: str
    item: str
    value: int


# =========================================================
# Helpers
# =========================================================
def stable_news_id(source: str, title: str | None, published_at: str | None) -> str:
    """
    Stable ID for news item so frontend can vote by item-id consistently.
    """
    base = f"{source}|{title or ''}|{published_at or ''}".strip()
    return hashlib.sha256(base.encode("utf-8")).hexdigest()[:16]


def load_meme_catalog():
    """
    Loads memes.json once on startup.
    """
    global MEME_CATALOG
    try:
        p = Path(MEMES_FILE)
        data = json.loads(p.read_text(encoding="utf-8"))
        MEME_CATALOG = data.get("memes", []) or []
    except Exception as e:
        print("Failed to load memes.json:", e)
        MEME_CATALOG = []


def get_user_id(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> int:
    """
    JWT auth. Token is expected in Authorization: Bearer <token>
    """
    token = creds.credentials

    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise HTTPException(500, "JWT_SECRET is not set")

    alg = os.getenv("JWT_ALGORITHM", "HS256")

    try:
        payload = jwt.decode(token, secret, algorithms=[alg])
        return int(payload["sub"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except Exception:
        raise HTTPException(401, "Invalid token")


def _ensure_json(value, default):
    """
    Some DB drivers return jsonb as str; normalize.
    """
    if value is None:
        return default
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return default
    return value


def load_user_preferences(conn, user_id: int) -> dict | None:
    q = text("""
        SELECT crypto_assets, investor_type, content_type
        FROM user_preferences
        WHERE user_id = :id
        LIMIT 1
    """)
    row = conn.execute(q, {"id": user_id}).fetchone()
    if row is None:
        return None

    assets = _ensure_json(row.crypto_assets, [])
    content = _ensure_json(row.content_type, [])

    # Ensure expected types
    if not isinstance(assets, list):
        assets = [assets]
    if not isinstance(content, list):
        content = [content]

    return {
        "crypto_assets": assets,
        "investor_type": row.investor_type,
        "content_type": content,
    }


def load_daily_dashboard(conn, user_id: int, day_: date):
    q = text("""
        SELECT id, sections
        FROM daily_dashboard
        WHERE user_id = :user_id AND day = :day
        ORDER BY created_at DESC
        LIMIT 1
    """)
    row = conn.execute(q, {"user_id": user_id, "day": day_}).fetchone()
    if row is None:
        return None

    sections = row[1]
    if isinstance(sections, str):
        sections = json.loads(sections)

    return {"dashboard_id": int(row[0]), "sections": sections}


def save_daily_dashboard(conn, user_id: int, day_: date, sections: dict) -> int:
    q = text("""
        INSERT INTO daily_dashboard (user_id, day, sections)
        VALUES (:user_id, :day, CAST(:sections AS jsonb))
        RETURNING id
    """)
    row = conn.execute(q, {
        "user_id": user_id,
        "day": day_,
        "sections": json.dumps(sections),
    }).fetchone()
    return int(row[0])


def pick_meme(prefs: dict, exclude_ids_or_urls: set[str] | None = None) -> dict:
    """
    Picks a meme based on preferences (weighted),
    and supports exclude set to avoid same meme on refresh.
    """
    exclude_ids_or_urls = exclude_ids_or_urls or set()

    investor_type = (prefs.get("investor_type") or "").strip().lower()
    content = prefs.get("content_type") or []
    assets = prefs.get("crypto_assets") or []

    content_set = set(str(x).lower() for x in (content if isinstance(content, list) else [content]))
    assets_set = set(str(x).lower() for x in (assets if isinstance(assets, list) else [assets]))

    candidates: list[tuple[int, dict]] = []
    for m in (MEME_CATALOG or []):
        mid = str(m.get("id") or "")
        url = str(m.get("url") or "")
        if not url:
            continue
        if mid in exclude_ids_or_urls or url in exclude_ids_or_urls:
            continue

        tags = (m.get("tags") or {})
        inv_tags = set(x.lower() for x in (tags.get("investor") or []))
        con_tags = set(x.lower() for x in (tags.get("content") or []))
        ast_tags = set(x.lower() for x in (tags.get("assets") or []))

        score = 0
        if investor_type and investor_type in inv_tags:
            score += 4

        score += 2 * len(content_set.intersection(con_tags))
        score += min(3, len(assets_set.intersection(ast_tags)))  # cap so assets don't dominate

        candidates.append((score, m))

    if not candidates:
        pool = MEME_CATALOG or [
            {"id": "fallback_hodl", "title": "HODL mode", "url": "https://i.imgflip.com/1bij.jpg"},
            {"id": "fallback_moon", "title": "To the moon", "url": "https://i.imgflip.com/30b1gx.jpg"},
            {"id": "fallback_bhsl", "title": "Buy high sell low", "url": "https://i.imgflip.com/1ur9b0.jpg"},
        ]
        chosen = dict(random.choice(pool))
        chosen["reason"] = {"mode": "fallback"}
        return chosen

    weights = [(max(0, s) + 1) for (s, _) in candidates]
    chosen = random.choices([m for (_, m) in candidates], weights=weights, k=1)[0]

    chosen = dict(chosen)
    chosen["reason"] = {
        "investor_type": investor_type,
        "content": sorted(list(content_set)),
        "assets_sample": sorted(list(assets_set))[:5],
    }
    return chosen


def coingecko_base_url() -> str:
    mode = os.getenv("COINGECKO_MODE", "demo").lower()
    return "https://pro-api.coingecko.com/api/v3" if mode == "pro" else "https://api.coingecko.com/api/v3"


def create_access_token(user_id: int) -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise HTTPException(500, "JWT_SECRET is not set")
    alg = os.getenv("JWT_ALGORITHM", "HS256")
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    return jwt.encode(payload, secret, algorithm=alg)


async def fetch_prices(client: httpx.AsyncClient, assets: list[str]):
    """
    CoinGecko /simple/price.
    Returns consistent shape: {source, data, error}
    """
    prices = {"source": "coingecko", "data": {}, "error": None}

    ids = [str(a).strip().lower() for a in assets if str(a).strip()]
    if not ids:
        prices["error"] = "No assets to fetch prices for"
        return prices
    key_cache = ",".join(ids)
    now = time.time()
    hit = PRICE_CACHE.get(key_cache)
    if hit and now - hit[0] < PRICE_TTL:
        return {"source": "coingecko_cache", "data": hit[1], "error": None}

    try:
        base = coingecko_base_url()
        params = {"ids": ",".join(ids), "vs_currencies": "usd", "include_24hr_change": "true"}
        cg_key = os.getenv("COINGECKO_API_KEY")
        headers = {"x-cg-demo-api-key": os.getenv("COINGECKO_API_KEY")} if os.getenv("COINGECKO_API_KEY") else {}

        r = await client.get(f"{base}/simple/price", params=params, headers=headers)
        if r.status_code == 200:
            j = r.json() or {}
            PRICE_CACHE[key_cache] = (now, j)

            if not j:
                prices["error"] = "CoinGecko returned empty data (rate-limit or invalid ids)"
            else:
                prices["data"] = j
        else:
            prices["error"] = f"CoinGecko status {r.status_code}"
            
        if r.status_code == 429:
            prices["error"] = "CoinGecko rate-limited (429)"
            return prices

    except Exception as e:
        prices["error"] = str(e)

    return prices


async def fetch_price_chart(client: httpx.AsyncClient, assets: list[str], days: int = 7):
    chart = {"source": "coingecko", "range": f"{days}d", "data": {}, "error": None}

    if not assets:
        chart["error"] = "No assets for chart"
        return chart

    base = coingecko_base_url()
    cg_key = os.getenv("COINGECKO_API_KEY")
    headers = {"x-cg-demo-api-key": os.getenv("COINGECKO_API_KEY")} if os.getenv("COINGECKO_API_KEY") else {}

    failed = []

    try:
        for asset in assets:
            r = await client.get(
                f"{base}/coins/{asset}/market_chart",
                params={"vs_currency": "usd", "days": days},
                headers=headers,
                timeout=15.0,
            )

            if r.status_code != 200:
                failed.append(asset)
                continue

            j = r.json() or {}
            prices = j.get("prices", [])
            if prices:
                chart["data"][asset] = prices

    except Exception as e:
        chart["error"] = str(e)
        return chart

    if not chart["data"]:
        chart["error"] = f"CoinGecko chart unavailable (failed assets: {failed[:3]})"

    return chart


async def coingecko_search_first_id(client: httpx.AsyncClient, query: str):
    base = coingecko_base_url()
    cg_key = os.getenv("COINGECKO_API_KEY")
    headers = {"x-cg-demo-api-key": os.getenv("COINGECKO_API_KEY")} if os.getenv("COINGECKO_API_KEY") else {}

    r = await client.get(f"{base}/search", params={"query": query}, headers=headers)
    if r.status_code != 200:
        return None

    coins = (r.json() or {}).get("coins") or []
    if not coins:
        return None

    top = coins[0]
    return {
        "id": top.get("id"),
        "name": top.get("name"),
        "symbol": (top.get("symbol") or "").upper(),
        "query": query,
    }


async def fetch_news(client: httpx.AsyncClient, prefs: dict, limit: int = 5):
    """
    CryptoPanic API with simple relevance scoring.
    Falls back to a static message if token missing.
    """
    news = {"source": "cryptopanic", "data": [], "error": None}
    token = os.getenv("CRYPTOPANIC_TOKEN")

    if not token:
        news["error"] = "CRYPTOPANIC_TOKEN missing (showing fallback)"
        news["data"] = [{"id": stable_news_id("fallback", "No CryptoPanic token", None), "title": "No CryptoPanic token configured", "published_at": None}]
        return news

    try:
        url = "https://cryptopanic.com/api/v1/posts/"
        params = {
            "auth_token": token,
            "public": "true",
            "kind": "news",
            "filter": "hot",
            "currencies": "BTC,ETH",
        }
        headers = {"User-Agent": "crypto-investor-dashboard/1.0"}

        rn = await client.get(url, params=params, headers=headers, timeout=15.0)

        ct = (rn.headers.get("content-type") or "").lower()
        print("CryptoPanic status:", rn.status_code)
        print("CryptoPanic content-type:", ct)
        print("CryptoPanic body head:", rn.text[:300])

        if rn.status_code != 200:
            raise RuntimeError(f"CryptoPanic status {rn.status_code}")

        if "application/json" not in ct:
            raise RuntimeError(f"CryptoPanic non-JSON response (ct={ct})")

        payload = rn.json() or {}
        data = payload.get("results") or []



        if rn.status_code == 200:
            data = (rn.json() or {}).get("results") or []
            assets = set((prefs.get("crypto_assets") or []))
            content_types = set((prefs.get("content_type") or []))

            scored = []
            for item in data:
                title = (item.get("title") or "").lower()
                score = 0

                for a in assets:
                    if a.lower() in title:
                        score += 3

                if "regulation" in content_types and any(x in title for x in ["sec", "law", "court", "regulation"]):
                    score += 2
                if "security" in content_types and any(x in title for x in ["hack", "exploit", "breach"]):
                    score += 2
                if "market_news" in content_types and any(x in title for x in ["price", "market", "surge", "drop"]):
                    score += 1
                if "social" in content_types and any(x in title for x in ["twitter", "elon", "sentiment"]):
                    score += 1

                scored.append((score, item))

            scored.sort(key=lambda x: x[0], reverse=True)
            news["data"] = [
                {
                    "id": stable_news_id("cryptopanic", i.get("title"), i.get("published_at")),
                    "title": i.get("title"),
                    "summary": (
                        i.get("description")
                        or (i.get("metadata") or {}).get("description")
                        or (i.get("metadata") or {}).get("summary")
                        or i.get("text")
                        or ""
                    ),
                    "url": i.get("url") or i.get("link"),
                    "published_at": i.get("published_at"),
                    "source": (i.get("source") or {}).get("title") or (i.get("source") or {}).get("domain"),
                }
                for (_, i) in scored[:limit]
            ]

        else:
            news["error"] = f"CryptoPanic status {rn.status_code} (showing fallback)"
            news["source"] = "static"
            news["data"] = [
                {
                    "id": stable_news_id("static", "Crypto markets: daily roundup", None),
                    "title": "Crypto markets: daily roundup (fallback)",
                    "summary": "CryptoPanic is unavailable right now. This is a fallback item for UX stability.",
                    "url": "https://cryptopanic.com",   # אפשר לשים גם None
                    "published_at": None,
                    "source": "fallback",
                },
                {
                    "id": stable_news_id("static", "Watchlist: risk & volatility", None),
                    "title": "Watchlist: risk & volatility (fallback)",
                    "summary": "Focus on volatility, risk sizing, and major catalysts today.",
                    "url": None,
                    "published_at": None,
                    "source": "fallback",
                },
            ]

    except Exception as e:
        news["error"] = f"{e} (showing fallback)"
        news["source"] = "static"
        news["data"] = [
            {
                "id": stable_news_id("fallback", "News fetch failed", None),
                "title": "News fetch failed (fallback)",
                "summary": "Showing fallback items.",
                "url": None,
                "published_at": None,
                "source": "fallback",
            }
        ]

    return news


async def fetch_ai_insight(client: httpx.AsyncClient, investor_type: str, assets: list[str]):
    """
    OpenRouter free-model fallback.
    Enforces: mentions investor_type verbatim + max 40 words.
    """
    insight = {"source": "openrouter", "data": None, "error": None}
    key = os.getenv("OPENROUTER_API_KEY")

    if not key:
        insight["error"] = "OPENROUTER_API_KEY missing (showing fallback)"
        insight["data"] = "No AI key configured yet."
        return insight

    assets_clean = [a.strip().lower() for a in (assets or []) if isinstance(a, str) and a.strip()][:12]
    investor_label = (investor_type or "").strip()

    market_trend = "unknown"
    btc_trend = "unknown"
    volatility = "unknown"
    today_str = datetime.utcnow().strftime("%Y-%m-%d")

    # Optional: build a tiny "today snapshot" from CoinGecko (still free)
    try:
        if assets_clean:
            base = coingecko_base_url()
            mode = os.getenv("COINGECKO_MODE", "demo").lower()
            key = os.getenv("COINGECKO_API_KEY")

            headers = {}
            if key:
                if mode == "pro":
                    headers["x-cg-pro-api-key"] = key
                else:
                    headers["x-cg-demo-api-key"] = key  # או בלי header אם אין key


            r = await client.get(
                f"{base}/simple/price",
                params={"ids": ",".join(assets_clean), "vs_currencies": "usd", "include_24hr_change": "true"},
                headers=headers,
                timeout=15.0,
            )

            if r.status_code == 200:
                data = r.json() or {}
                changes = []
                for a in assets_clean:
                    ch = (data.get(a) or {}).get("usd_24h_change")
                    if isinstance(ch, (int, float)):
                        changes.append(float(ch))

                if changes:
                    avg = sum(changes) / len(changes)
                    avg_abs = sum(abs(x) for x in changes) / len(changes)
                    market_trend = "bullish" if avg > 0.6 else ("bearish" if avg < -0.6 else "sideways")
                    volatility = "high" if avg_abs >= 6 else ("medium" if avg_abs >= 2.5 else "low")

                btc_ch = (data.get("bitcoin") or {}).get("usd_24h_change")
                if isinstance(btc_ch, (int, float)):
                    btc_trend = "up" if btc_ch > 0.6 else ("down" if btc_ch < -0.6 else "flat")
    except Exception:
        pass

    prompt = f"""
You are a crypto market analyst.

Today (UTC date): {today_str}
Investor type: {investor_label}
User interest assets: {assets_clean}

Market snapshot today (based on 24h change of selected assets):
- Overall market trend: {market_trend}
- Bitcoin direction: {btc_trend}
- Volatility level: {volatility}

Instructions:
1) Write ONE daily insight grounded in today's snapshot.
2) It MUST be relevant to investor_type="{investor_label}" and MUST mention this exact value verbatim.
3) You MAY focus on 1–2 assets only; do NOT force mentioning all assets.
4) Ignore unknown/invalid assets and do not mention them.
5) Be specific and practical (what to watch / risk / positioning), not generic.
6) No placeholders. No price targets. No guarantees.
7) Max 40 words. Single paragraph only.
""".strip()

    FREE_MODELS = [
        "meta-llama/llama-3.3-70b-instruct:free",
        "mistralai/mistral-7b-instruct:free",
        "google/gemma-2-9b-it:free",
    ]

    try:
        for model in FREE_MODELS:
            ai = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "Be concise, grounded, and practical."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.5,
                    "max_tokens": 160,
                },
                timeout=25.0,
            )

            if ai.status_code != 200:
                print("OpenRouter non-200:", ai.status_code, "model:", model)
                continue

            j = ai.json() or {}
            txt = (j.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
            txt = re.sub(r"\s+", " ", txt).strip()

            print("AI model used:", model)
            print("AI Insight raw response:", repr(txt))

            if not txt:
                continue

            lower = txt.lower()
            if (investor_label or "").lower() not in lower:
                txt = f"For a {investor_label} investor: {txt}".strip()

            if market_trend != "unknown":
                has_today = ("today" in lower) or (market_trend in lower) or (btc_trend in lower) or (volatility in lower)
                if not has_today:
                    txt = f"Today’s market is {market_trend} with {volatility} volatility; {txt}".strip()

            words = txt.split()
            if len(words) > 40:
                txt = " ".join(words[:40]).rstrip(" ,.;:") + "."

            insight["data"] = txt
            return insight

        insight["error"] = "All free models returned empty output"
        insight["data"] = "AI insight unavailable today. Please refresh."
        return insight

    except Exception as e:
        insight["error"] = str(e)
        insight["data"] = "AI request failed."
        return insight


def generate_fun_section(_: dict):
    moods = [
        "Market mood: cautious optimism.",
        "Market mood: leverage is creeping back.",
        "Market mood: waiting for confirmation.",
        "Market mood: everyone thinks they're early.",
        "Market mood: low conviction, high noise.",
    ]
    facts = [
        "Most traders lose money not on bad entries – but bad exits.",
        "High volatility days statistically favor patient traders.",
        "Big moves often start when sentiment is most divided.",
        "Sideways markets cause more losses than crashes.",
    ]
    return {"type": "fun", "variant": "daily_fun", "text": random.choice(moods + facts)}


# =========================================================
# Auth endpoints
# =========================================================
@app.post("/auth/signup")
def signup(data: SignupReq):
    hashed_password = bcrypt.hashpw(data.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    query = text("""
        INSERT INTO users (name, email, password_hash)
        VALUES (:name, :email, :password_hash)
        RETURNING id
    """)

    try:
        with engine.begin() as conn:
            user_id = conn.execute(query, {
                "name": data.name,
                "email": data.email,
                "password_hash": hashed_password,
            }).scalar()
    except Exception:
        # Keep simple; you can tighten later with IntegrityError if you want
        raise HTTPException(409, "User already exists")

    token = create_access_token(int(user_id))
    return {
        "message": "user has been created successfully",
        "user_id": int(user_id),
        "access_token": token,
        "token_type": "bearer",
        "needsOnboarding": True,
    }


@app.post("/auth/login")
def login(data: LoginReq):
    query = text("SELECT id, password_hash FROM users WHERE email = :email")

    with engine.connect() as conn:
        user = conn.execute(query, {"email": data.email}).fetchone()

    if user is None:
        raise HTTPException(401, "Invalid email or password")

    user_id, password_hash = user
    valid = bcrypt.checkpw(data.password.encode("utf-8"), password_hash.encode("utf-8"))
    if not valid:
        raise HTTPException(401, "Invalid email or password")

    token = create_access_token(int(user_id))
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me")
def me(user_id: int = Depends(get_user_id)):
    user_q = text("SELECT id, name, email FROM users WHERE id = :id")
    pref_q = text("SELECT 1 FROM user_preferences WHERE user_id = :id LIMIT 1")

    with engine.connect() as conn:
        user = conn.execute(user_q, {"id": user_id}).fetchone()
        has_pref = conn.execute(pref_q, {"id": user_id}).fetchone() is not None

    if user is None:
        raise HTTPException(401, "User not found")

    return {"id": user.id, "name": user.name, "email": user.email, "needsOnboarding": (not has_pref)}


# =========================================================
# Onboarding
# =========================================================
@app.post("/onboarding")
async def save_onboarding(data: OnboardingReq, user_id: int = Depends(get_user_id)):
    """
    Saves user onboarding preferences.
    Assumption: frontend sends only valid CoinGecko-style ids (including "Other" only if resolved).
    This endpoint therefore validates and persists the ids as-is (no CoinGecko network calls here).
    """
    if data.investor_type not in ALLOWED_INVESTOR_TYPES:
        raise HTTPException(400, "Invalid investor_type")

    ct = data.content_type or []
    if not isinstance(ct, list) or any(x not in ALLOWED_CONTENT_TYPES for x in ct):
        raise HTTPException(400, "Invalid content_type")

    raw_assets = data.crypto_assets or []
    resolved_ids: list[str] = []
    warnings: list[str] = []

    # Accept only normalized ids provided by the client.
    # Basic sanity validation prevents storing garbage in DB.
    for a in raw_assets:
        s_id = str(a).strip().lower()
        if not s_id:
            continue

        # Allow typical CoinGecko ids: lowercase letters/numbers/dashes, length-limited.
        # Examples: "bitcoin", "avalanche-2", "banana-tape-wall", "the-open-network"
        if not re.fullmatch(r"[a-z0-9-]{2,64}", s_id):
            warnings.append(f'Invalid coin id "{s_id}".')
            continue

        resolved_ids.append(s_id)

    # Dedupe while keeping order
    seen = set()
    resolved_ids = [x for x in resolved_ids if not (x in seen or seen.add(x))]

    if not resolved_ids:
        return {
            "saved": False,
            "message": "Coin not found – please try again",
            "warnings": (warnings or ["Coin not found – please try again"]),
        }

    q = text("""
        INSERT INTO user_preferences (user_id, crypto_assets, investor_type, content_type)
        VALUES (:user_id, CAST(:crypto_assets AS jsonb), :investor_type, CAST(:content_type AS jsonb))
    """)

    try:
        with engine.begin() as conn:
            conn.execute(q, {
                "user_id": user_id,
                "crypto_assets": json.dumps(resolved_ids),
                "investor_type": data.investor_type,
                "content_type": json.dumps(ct),
            })
    except Exception:
        raise HTTPException(status_code=409, detail="Onboarding already completed")

    return {"saved": True, "message": "onboarding saved", "warnings": warnings, "crypto_assets": resolved_ids}


# =========================================================
# Dashboard
# =========================================================
@app.get("/dashboard")
async def dashboard(user_id: int = Depends(get_user_id)):
    with engine.connect() as conn:
        prefs = load_user_preferences(conn, user_id)
    if prefs is None:
        raise HTTPException(400, "Onboarding not completed")

    today = date.today()

    with engine.connect() as conn:
        existing = load_daily_dashboard(conn, user_id, today)
    if existing is not None:
        return {"preferences": prefs, "dashboard_id": existing["dashboard_id"], "sections": existing["sections"]}

    # DEV_MODE: return fast mock without external calls
    if DEV_MODE:
        sections = {
            "prices": {
                "source": "mock",
                "data": {
                    "bitcoin": {"usd": 65000, "usd_24h_change": 1.24},
                    "ethereum": {"usd": 3200, "usd_24h_change": -0.62},
                },
                "error": None,
            },
            "news": {
                "source": "mock",
                "data": [
                    {"id": stable_news_id("mock", "Bitcoin holds steady as volatility drops", str(today)), "title": "Bitcoin holds steady as volatility drops", "published_at": str(today)},
                    {"id": stable_news_id("mock", "ETH staking demand rises ahead of upgrade rumors", str(today)), "title": "ETH staking demand rises ahead of upgrade rumors", "published_at": str(today)},
                ],
                "error": None,
            },
            "ai_insight": {
                "source": "mock",
                "data": "Keep risk controlled. Scale in slowly, avoid chasing candles.",
                "error": None,
            },
            "meme": pick_meme(prefs),
        }

        if "charts" in prefs.get("content_type", []):
            now_ms = int(datetime.utcnow().timestamp() * 1000)
            day_ms = 24 * 60 * 60 * 1000
            ids = (prefs.get("crypto_assets") or ["bitcoin", "ethereum"])[:4]

            data = {}
            base = 100.0
            for i, cid in enumerate(ids):
                series = []
                v = base + i * 25
                for k in range(7):
                    v = v * (1 + (random.random() - 0.5) * 0.02)
                    series.append([now_ms - (6 - k) * day_ms, round(v, 2)])
                data[cid] = series

            sections["chart"] = {
                "source": "mock",
                "range": "7d",
                "data": data,
                "error": None,
            }

        if "fun" in prefs.get("content_type", []):
            sections["fun"] = generate_fun_section(prefs)

        with engine.begin() as conn:
            dashboard_id = save_daily_dashboard(conn, user_id, today, sections)

        return {"preferences": prefs, "dashboard_id": dashboard_id, "sections": sections}

    # Real mode
    asset_ids = [str(x).strip().lower() for x in (prefs.get("crypto_assets") or []) if str(x).strip()]
    investor_type = prefs.get("investor_type") or ""
    content_types = set(prefs.get("content_type") or [])

    include_charts = "charts" in content_types
    include_fun = "fun" in content_types

    # Keep total content tight when adding optional sections
    news_limit = 5 - (1 if include_charts else 0) - (1 if include_fun else 0)
    news_limit = max(2, news_limit)

    async with httpx.AsyncClient(timeout=12) as client:
        prices = await fetch_prices(client, asset_ids)
        news = await fetch_news(client, prefs, limit=news_limit)
        insight = await fetch_ai_insight(client, investor_type, asset_ids)

        sections = {
            "prices": prices,
            "news": news,
            "ai_insight": insight,
            "meme": pick_meme(prefs),
        }

        if include_charts:
            sections["chart"] = await fetch_price_chart(client, asset_ids, days=7)

        if include_fun:
            sections["fun"] = generate_fun_section(prefs)

    with engine.begin() as conn:
        dashboard_id = save_daily_dashboard(conn, user_id, today, sections)

    return {"preferences": prefs, "dashboard_id": dashboard_id, "sections": sections}


@app.post("/dashboard/refresh/{section}")
async def refresh_section(section: str, user_id: int = Depends(get_user_id)):
    if section not in ALLOWED_DASHBOARD_SECTIONS:
        raise HTTPException(400, "Invalid section")

    with engine.connect() as conn:
        prefs = load_user_preferences(conn, user_id)
    if prefs is None:
        raise HTTPException(400, "Onboarding not completed")

    today = date.today()

    with engine.connect() as conn:
        existing = load_daily_dashboard(conn, user_id, today)
    if existing is None:
        raise HTTPException(400, "Daily dashboard not generated yet. Call GET /dashboard first.")

    assets = [str(x).strip().lower() for x in (prefs.get("crypto_assets") or []) if str(x).strip()]
    investor_type = prefs.get("investor_type") or ""

    async with httpx.AsyncClient(timeout=12) as client:
        if section == "prices":
            new_value = await fetch_prices(client, assets)

        elif section == "news":
            content_types = set(prefs.get("content_type") or [])
            include_charts = "charts" in content_types
            include_fun = "fun" in content_types
            news_limit = max(2, 5 - (1 if include_charts else 0) - (1 if include_fun else 0))
            new_value = await fetch_news(client, prefs, limit=news_limit)

        elif section == "ai_insight":
            new_value = await fetch_ai_insight(client, investor_type, assets)

        elif section == "meme":
            current = (existing.get("sections") or {}).get("meme") or {}
            exclude = set()
            if isinstance(current, dict):
                if current.get("id"):
                    exclude.add(str(current["id"]))
                if current.get("url"):
                    exclude.add(str(current["url"]))
            new_value = pick_meme(prefs, exclude_ids_or_urls=exclude)

        elif section == "chart":
            new_value = await fetch_price_chart(client, assets, days=7)

        elif section == "fun":
            new_value = generate_fun_section(prefs)

        else:
            raise HTTPException(400, "Invalid section")

    # Prevent overwriting good data with empty/failed payloads
    if isinstance(new_value, dict):
        if new_value.get("error") and not (new_value.get("data") or {}):
            return {
                "preferences": prefs,
                "dashboard_id": existing["dashboard_id"],
                "sections": existing["sections"],
                "updated": section,
                "skipped": True,
            }


        if section in ("prices", "chart") and not (new_value.get("data") or {}):
            return {
                "preferences": prefs,
                "dashboard_id": existing["dashboard_id"],
                "sections": existing["sections"],
                "updated": section,
                "skipped": True,
            }

    latest = dict(existing.get("sections") or {})
    latest[section] = new_value

    with engine.begin() as conn:
        dashboard_id = save_daily_dashboard(conn, user_id, today, latest)

    return {"preferences": prefs, "dashboard_id": dashboard_id, "sections": latest, "updated": section}


# =========================================================
# Votes
# =========================================================
@app.post("/votes")
def vote(data: VoteReq, user_id: int = Depends(get_user_id)):
    if data.value not in (1, -1):
        raise HTTPException(400, "value must be 1 or -1")

    # Tighten section to avoid garbage values in DB
    if data.section not in ALLOWED_DASHBOARD_SECTIONS:
        raise HTTPException(400, "Invalid section")

    q = text("""
        INSERT INTO user_votes (user_id, day, dashboard_id, section, item, value)
        VALUES (:user_id, CURRENT_DATE, :dashboard_id, :section, :item, :value)
        ON CONFLICT (user_id, dashboard_id, section, item)
        DO UPDATE SET value = EXCLUDED.value, created_at = now()
    """)

    with engine.begin() as conn:
        conn.execute(q, {
            "user_id": user_id,
            "dashboard_id": data.dashboard_id,
            "section": data.section,
            "item": data.item,
            "value": data.value,
        })

    return {"message": "vote saved"}


@app.get("/votes")
def get_votes(
    date: str = Query("today"),
    dashboard_id: int | None = None,
    user_id: int = Depends(get_user_id),
):
    q = """
        SELECT section, item, value
        FROM user_votes
        WHERE user_id = :user_id
    """
    params = {"user_id": user_id}

    if date == "today":
        q += " AND day = CURRENT_DATE"
    else:
        q += " AND day = :day"
        params["day"] = date  # expects YYYY-MM-DD

    if dashboard_id is not None:
        q += " AND dashboard_id = :dashboard_id"
        params["dashboard_id"] = dashboard_id

    with engine.connect() as conn:
        rows = conn.execute(text(q), params).fetchall()

    return [{"section": r[0], "item": r[1], "value": r[2]} for r in rows]
