import os
import jwt
from datetime import datetime, timedelta, date
from fastapi import FastAPI, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
import bcrypt
from dotenv import load_dotenv
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import json
import random
import httpx
from fastapi.middleware.cors import CORSMiddleware
from db import init_db, engine

load_dotenv()
app = FastAPI()

@app.on_event("startup")
def on_startup():
    init_db()
    
bearer = HTTPBearer()
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"

def _parse_origins():
    raw = os.getenv("ALLOW_ORIGINS", "http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    section: str  
    item: str 
    value: int      

COINGECKO_IDS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "XRP": "ripple",
    "ADA": "cardano",
    "DOGE": "dogecoin",
    "BNB": "binancecoin",
    "USDT": "tether",
    "AVAX": "avalanche-2",
}

MEMES_BY_INVESTOR = {
    "hodler": [
        {"title": "HODL mode", "url": "https://i.imgflip.com/1bij.jpg"},
        {"title": "Diamond hands", "url": "https://i.imgflip.com/4/3si4.jpg"},
    ],
    "day_trader": [
        {"title": "To the moon", "url": "https://i.imgflip.com/30b1gx.jpg"},
        {"title": "1m candle PTSD", "url": "https://i.imgflip.com/1ur9b0.jpg"},
    ],
    "nft_collector": [
        {"title": "JPEG investor", "url": "https://i.imgflip.com/2/1otk96.jpg"},
        {"title": "Floor price vibes", "url": "https://i.imgflip.com/26am.jpg"},
    ],
}

MEMES_BY_CONTENT = {
    "fun": [
        {"title": "Buy high sell low", "url": "https://i.imgflip.com/1ur9b0.jpg"},
        {"title": "Crypto mood", "url": "https://i.imgflip.com/4/1g8my4.jpg"},
    ],
    "social": [
        {"title": "Twitter experts", "url": "https://i.imgflip.com/4/2wifvo.jpg"},
    ],
    "market news": [
        {"title": "Breaking news panic", "url": "https://i.imgflip.com/4/1bij.jpg"},
    ],
    "charts": [
        {"title": "Staring at charts", "url": "https://i.imgflip.com/4/1e7ql7.jpg"},
    ],
}

DEFAULT_MEME_POOL = [
    {"title": "HODL mode", "url": "https://i.imgflip.com/1bij.jpg"},
    {"title": "To the moon", "url": "https://i.imgflip.com/30b1gx.jpg"},
    {"title": "Buy high sell low", "url": "https://i.imgflip.com/1ur9b0.jpg"},
]

def get_user_id(creds: HTTPAuthorizationCredentials = Depends(bearer)):
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
    if value is None:
        return default
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return default
    return value

def load_user_preferences(conn, user_id: int):
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

    # להבטיח טיפוסים צפויים:
    if not isinstance(assets, list):
        assets = [assets]
    if not isinstance(content, list):
        content = [content]

    return {
        "crypto_assets": assets,
        "investor_type": row.investor_type,
        "content_type": content,
    }

def load_daily_dashboard(conn, user_id: int, day: date):
    q = text("""
        SELECT sections
        FROM daily_dashboard
        WHERE user_id = :user_id AND day = :day
        LIMIT 1
    """)
    row = conn.execute(q, {"user_id": user_id, "day": day}).fetchone()
    if row is None:
        return None

    sections = row.sections
    if isinstance(sections, str):
        sections = json.loads(sections)

    return sections

def save_daily_dashboard(conn, user_id: int, day: date, sections: dict):
    q = text("""
        INSERT INTO daily_dashboard (user_id, day, sections)
        VALUES (:user_id, :day, CAST(:sections AS jsonb))
        ON CONFLICT (user_id, day) DO NOTHING
    """)
    conn.execute(q, {
        "user_id": user_id,
        "day": day,
        "sections": json.dumps(sections),
    })
    conn.commit()

def update_daily_section(conn, user_id: int, day: date, section_key: str, section_value):
    q = text("""
        UPDATE daily_dashboard
        SET sections = jsonb_set(
            sections,
            ARRAY[:section_key],
            CAST(:value AS jsonb),
            true
        )
        WHERE user_id = :user_id AND day = :day
    """)
    conn.execute(q, {
        "user_id": user_id,
        "day": day,
        "section_key": section_key,
        "value": json.dumps(section_value),
    })
    conn.commit()


def pick_meme(prefs: dict):
    investor_type = (prefs.get("investor_type") or "").lower()
    content = prefs.get("content_type") or []  # אמור להיות list (JSON)

    content_set = set([str(x).lower() for x in (content if isinstance(content, list) else [content])])

    pool = []

    if investor_type in MEMES_BY_INVESTOR:
        pool += MEMES_BY_INVESTOR[investor_type]

    for k, arr in MEMES_BY_CONTENT.items():
        if k in content_set:
            pool += arr

    if not pool:
        pool = DEFAULT_MEME_POOL

    return random.choice(pool)

def coingecko_base_url():
    mode = os.getenv("COINGECKO_MODE", "demo").lower()
    return "https://pro-api.coingecko.com/api/v3" if mode == "pro" else "https://api.coingecko.com/api/v3"

    
def create_access_token(user_id: int):
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
    prices = {"source": "coingecko", "data": {}, "error": None}

    ids = [str(a).strip().lower() for a in assets if str(a).strip()]
    ids = [x for x in ids if x]
    if not ids:
        prices["error"] = "No assets to fetch prices for"
        return prices

    try:
        base = coingecko_base_url()
        params = {"ids": ",".join(ids), "vs_currencies": "usd", "include_24hr_change": "true"}
        cg_key = os.getenv("COINGECKO_API_KEY")
        headers = {"x-cg-pro-api-key": cg_key} if cg_key else {}

        r = await client.get(f"{base}/simple/price", params=params, headers=headers)
        if r.status_code == 200:
            prices["data"] = r.json()
        else:
            prices["error"] = f"CoinGecko status {r.status_code}"
    except Exception as e:
        prices["error"] = str(e)

    return prices

async def coingecko_search_first_id(client: httpx.AsyncClient, query: str):
    base = coingecko_base_url()
    cg_key = os.getenv("COINGECKO_API_KEY")
    headers = {"x-cg-pro-api-key": cg_key} if cg_key else {}

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

async def fetch_news(client: httpx.AsyncClient, prefs: dict):
    news = {"source": "cryptopanic", "data": [], "error": None}
    token = os.getenv("CRYPTOPANIC_TOKEN")

    if not token:
        news["error"] = "CRYPTOPANIC_TOKEN missing (showing fallback)"
        news["data"] = [{"title": "No CryptoPanic token configured", "published_at": None}]
        return news

    # כרגע נשאיר כמו שיש לך (10 ראשונים). אחרי זה נשפר ל-3–5 רלוונטיים.
    try:
        rn = await client.get(
            "https://cryptopanic.com/api/developer/v2/posts/",
            params={"auth_token": token, "public": "true"},
        )
        if rn.status_code == 200:
            data = rn.json().get("results") or []
            news["data"] = [
                {"title": item.get("title"), "published_at": item.get("published_at")}
                for item in data[:10]
            ]
        else:
            news["error"] = f"CryptoPanic status {rn.status_code}"
    except Exception as e:
        news["error"] = str(e)

    return news


async def fetch_ai_insight(client: httpx.AsyncClient, investor_type: str, assets: list[str]):
    insight = {"source": "openrouter", "data": None, "error": None}
    key = os.getenv("OPENROUTER_API_KEY")

    if not key:
        insight["error"] = "OPENROUTER_API_KEY missing (showing fallback)"
        insight["data"] = "No AI key configured yet."
        return insight

    try:
        prompt = (
            f"Give ONE short crypto insight for a {investor_type}. "
            f"Assets: {assets}. Keep under 40 words."
        )
        ai = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": "openai/gpt-3.5-turbo",
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        if ai.status_code == 200:
            j = ai.json()
            insight["data"] = j["choices"][0]["message"]["content"]
        else:
            insight["error"] = f"OpenRouter status {ai.status_code}"
            insight["data"] = "AI key configured but request failed."
    except Exception as e:
        insight["error"] = str(e)
        insight["data"] = "AI request failed."

    return insight


def fetch_meme(prefs: dict):
    return pick_meme(prefs)

# saving new user in DB
@app.post("/auth/signup")
def signup(data: SignupReq):
    # hash password
    hashed_password = bcrypt.hashpw(
        data.password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")

    query = text("""
        INSERT INTO users (name, email, password_hash)
        VALUES (:name, :email, :password_hash)
        RETURNING id
    """)

    with engine.connect() as conn:
        try:
            result = conn.execute(
                query,
                {
                    "name": data.name,
                    "email": data.email,
                    "password_hash": hashed_password,
                }
            )
            conn.commit()
            user_id = result.scalar()
        except Exception:
            raise HTTPException(400, "User already exists")

    token = create_access_token(user_id)

    return {
        "message": "user has been created successfully",
        "user_id": user_id,
        "access_token": token,
        "token_type": "bearer",
        "needsOnboarding": True
    }

# authenticate user
@app.post("/auth/login")
def login(data: LoginReq):
    query = text("SELECT id, password_hash FROM users WHERE email = :email")
    with engine.connect() as conn:
        result = conn.execute(query, {"email": data.email})
        user = result.fetchone()
        
        # check if user exists
        if user is None:
            raise HTTPException(401, "Invalid email or password")
        
        user_id, password_hash = user
        
        # verify password
        valid = bcrypt.checkpw(data.password.encode("utf-8"), password_hash.encode("utf-8"))
        if not valid:
            raise HTTPException(401, "Invalid email or password")
        
        token = create_access_token(user_id)
        return {"access_token": token, "token_type": "bearer"}
    
# get current user info
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

# save onboarding data
@app.post("/onboarding")
async def save_onboarding(data: OnboardingReq, user_id: int = Depends(get_user_id)):
    q = text("""
        INSERT INTO user_preferences (user_id, crypto_assets, investor_type, content_type)
        VALUES (:user_id, CAST(:crypto_assets AS jsonb), :investor_type, CAST(:content_type AS jsonb))
    """)

    raw_assets = data.crypto_assets or []
    resolved_ids: list[str] = []
    warnings: list[str] = []

    async with httpx.AsyncClient(timeout=12) as client:
        for a in raw_assets:
            s = str(a).strip()
            if not s:
                continue

            sym = s.upper()

            # Known symbol -> convert to ID
            if sym in COINGECKO_IDS:
                resolved_ids.append(COINGECKO_IDS[sym])
                continue

            # Free text (Other) -> search
            found = await coingecko_search_first_id(client, s)
            if found and found.get("id"):
                resolved_ids.append(found["id"])
            else:
                warnings.append(f'Could not recognize "{s}" as a coin.')

    # dedupe keep order
    seen = set()
    resolved_ids = [x for x in resolved_ids if not (x in seen or seen.add(x))]

    # If no valid assets -> don't save, but don't fail
    if not resolved_ids:
        return {
            "saved": False,
            "message": "Coin not found – please try again",
            "warnings": (warnings or ["Coin not found – please try again"]),
        }

    try:
        with engine.connect() as conn:
            conn.execute(q, {
                "user_id": user_id,
                "crypto_assets": json.dumps(resolved_ids),
                "investor_type": data.investor_type,
                "content_type": json.dumps(data.content_type)
            })
            conn.commit()

    except Exception:
        raise HTTPException(status_code=409, detail="Onboarding already completed")

    return {
        "saved": True,
        "message": "onboarding saved",
        "warnings": warnings,
        "crypto_assets": resolved_ids,
    }

@app.get("/dashboard")
async def dashboard(user_id: int = Depends(get_user_id)):
    with engine.connect() as conn:
        prefs = load_user_preferences(conn, user_id)

    if prefs is None:
        raise HTTPException(400, "Onboarding not completed")

    today = date.today()

    with engine.connect() as conn:
        existing_sections = load_daily_dashboard(conn, user_id, today)

    if existing_sections is not None:
        return {"preferences": prefs, "sections": existing_sections}

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
                    {"title": "Bitcoin holds steady as volatility drops", "published_at": str(today)},
                    {"title": "ETH staking demand rises ahead of upgrade rumors", "published_at": str(today)},
                ],
                "error": None,
            },
            "ai_insight": {
                "source": "mock",
                "data": "Keep risk controlled. Scale in slowly, avoid chasing candles.",
                "error": None,
            },
            "meme": fetch_meme(prefs),
        }

        with engine.connect() as conn:
            save_daily_dashboard(conn, user_id, today, sections)

        return {"preferences": prefs, "sections": sections}

    asset_ids = [str(x).strip().lower() for x in (prefs["crypto_assets"] or []) if str(x).strip()]
    investor_type = prefs["investor_type"]

    coins_meta = [{"id": cid, "name": cid.replace("-", " ").title()} for cid in asset_ids]

    async with httpx.AsyncClient(timeout=12) as client:
        prices = {"source": "coingecko", "data": {}, "meta": coins_meta, "error": None}

        if asset_ids:
            r = await client.get(
                f"{coingecko_base_url()}/simple/price",
                params={"ids": ",".join(asset_ids), "vs_currencies": "usd", "include_24hr_change": "true"},
            )

            if r.status_code == 200:
                prices["data"] = r.json()
            else:
                prices["error"] = f"CoinGecko status {r.status_code}"

        news = await fetch_news(client, prefs)
        insight = await fetch_ai_insight(client, investor_type, asset_ids)

    meme = fetch_meme(prefs)

    sections = {
        "prices": prices,
        "news": news,
        "ai_insight": insight,
        "meme": meme,
    }

    with engine.connect() as conn:
        save_daily_dashboard(conn, user_id, today, sections)

    return {"preferences": prefs, "sections": sections}

@app.post("/dashboard/refresh/{section}")
async def refresh_section(
    section: str,
    user_id: int = Depends(get_user_id)
):
    allowed = {"prices", "news", "ai_insight", "meme"}
    if section not in allowed:
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

    assets = [str(x).strip().lower() for x in (prefs["crypto_assets"] or []) if str(x).strip()]
    investor_type = prefs["investor_type"]

    async with httpx.AsyncClient(timeout=12) as client:
        if section == "prices":
            new_value = await fetch_prices(client, assets)
        elif section == "news":
            new_value = await fetch_news(client, prefs)
        elif section == "ai_insight":
            new_value = await fetch_ai_insight(client, investor_type, assets)
        elif section == "meme":
            new_value = fetch_meme(prefs)

    with engine.connect() as conn:
        update_daily_section(conn, user_id, today, section, new_value)

    with engine.connect() as conn:
        updated_sections = load_daily_dashboard(conn, user_id, today)

    return {"preferences": prefs, "sections": updated_sections, "updated": section}

@app.post("/votes")
def vote(data: VoteReq, user_id: int = Depends(get_user_id)):
    if data.value not in (1, -1):
        raise HTTPException(400, "value must be 1 or -1")

    q = text("""
        INSERT INTO user_votes (user_id, day, section, item, value)
        VALUES (:user_id, CURRENT_DATE, :section, :item, :value)
        ON CONFLICT (user_id, day, section, item)
        DO UPDATE SET value = EXCLUDED.value, created_at = now()
    """)


    with engine.connect() as conn:
        conn.execute(q, {
            "user_id": user_id,
            "section": data.section,
            "item": data.item,
            "value": data.value
        })
        conn.commit()

    return {"message": "vote saved"}

@app.get("/votes")
def get_votes(date: str = Query("today"), user_id: int = Depends(get_user_id)):
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

    with engine.connect() as conn:
        rows = conn.execute(text(q), params).fetchall()

    return [{"section": r[0], "item": r[1], "value": r[2]} for r in rows]
