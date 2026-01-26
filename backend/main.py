import os
import jwt
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import text
import bcrypt
from dotenv import load_dotenv
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from db import engine
import json
import random
import httpx
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()
app = FastAPI()
bearer = HTTPBearer()
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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

COINGECKO_IDS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "XRP": "ripple",
    "ADA": "cardano",
    "DOGE": "dogecoin",
}

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

    assets = row.crypto_assets
    content = row.content_type

    if isinstance(assets, str):
        assets = json.loads(assets)
    if isinstance(content, str):
        content = json.loads(content)

    return {
        "crypto_assets": assets,
        "investor_type": row.investor_type,
        "content_type": content,
    }

def pick_meme():
    memes = [
        {"title": "HODL mode", "url": "https://i.imgflip.com/1bij.jpg"},
        {"title": "To the moon", "url": "https://i.imgflip.com/30b1gx.jpg"},
        {"title": "Buy high sell low", "url": "https://i.imgflip.com/1ur9b0.jpg"},
    ]
    return random.choice(memes)

def coingecko_base_url():
    mode = os.getenv("COINGECKO_MODE", "demo").lower()
    return "https://pro-api.coingecko.com/api/v3" if mode == "pro" else "https://api.coingecko.com/api/v3"

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

    # generate JWT (זהה ל-login)
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise HTTPException(500, "JWT_SECRET is not set")

    alg = os.getenv("JWT_ALGORITHM", "HS256")
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(hours=1),
    }
    token = jwt.encode(payload, secret, algorithm=alg)

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
        
        # generate JWT token
        secret = os.getenv("JWT_SECRET")
        if not secret:
            raise HTTPException(status_code=500, detail="JWT_SECRET is not set")
        alg = os.getenv("JWT_ALGORITHM", "HS256")
        payload = {"sub": str(user_id), "exp": datetime.utcnow() + timedelta(hours=1)}
        token = jwt.encode(payload, secret, algorithm=alg)

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
def save_onboarding(data: OnboardingReq, user_id: int = Depends(get_user_id)):
    assets_json = json.dumps(data.crypto_assets)
    content_json = json.dumps(data.content_type)

    q = text("""
        INSERT INTO user_preferences (user_id, crypto_assets, investor_type, content_type)
        VALUES (:user_id, :crypto_assets, :investor_type, :content_type)
    """)

    with engine.connect() as conn:
        conn.execute(q, {
            "user_id": user_id,
            "crypto_assets": assets_json,
            "investor_type": data.investor_type,
            "content_type": content_json
        })
        conn.commit()

    return {"message": "onboarding saved"}

@app.get("/dashboard")
async def dashboard(user_id: int = Depends(get_user_id)):
    # load user preferences 
    with engine.connect() as conn:
        prefs = load_user_preferences(conn, user_id)

    if prefs is None:
        raise HTTPException(400, "Onboarding not completed")

    if DEV_MODE:
        return {
            "preferences": prefs,
            "sections": {
                "prices": {"source": "mock", "data": {"bitcoin": {"usd": 65000}, "ethereum": {"usd": 3200}}, "error": None},
                "news": {"source": "mock", "data": [
                    {"title": "Bitcoin holds steady as volatility drops", "published_at": "2026-01-26"},
                    {"title": "ETH staking demand rises ahead of upgrade rumors", "published_at": "2026-01-26"},
                ], "error": None},
                "ai_insight": {"source": "mock", "data": "Keep risk controlled. Scale in slowly, avoid chasing candles.", "error": None},
                "meme": {"title": "HODL mode", "url": "https://i.imgflip.com/1bij.jpg"},
            },
        }

    assets = [a.upper() for a in prefs["crypto_assets"]]
    investor_type = prefs["investor_type"]

    prices = {"source": "coingecko", "data": {}, "error": None}
    news = {"source": "cryptopanic", "data": [], "error": None}
    insight = {"source": "openrouter", "data": None, "error": None}
    meme = pick_meme()

    ids = [COINGECKO_IDS.get(sym) for sym in assets]
    ids = [x for x in ids if x]
    if not ids:
        prices["error"] = "No supported assets (add mapping in COINGECKO_IDS)"

    cryptopanic_token = os.getenv("CRYPTOPANIC_TOKEN")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")

    async with httpx.AsyncClient(timeout=12) as client:
        # --- COINGECKO ---
        if ids:
            try:
                base = coingecko_base_url()
                params = {"ids": ",".join(ids), "vs_currencies": "usd"}
                cg_key = os.getenv("COINGECKO_API_KEY")
                headers = {"x-cg-pro-api-key": cg_key} if cg_key else {}

                r = await client.get(f"{base}/simple/price", params=params, headers=headers)
                if r.status_code == 200:
                    prices["data"] = r.json()
                else:
                    prices["error"] = f"CoinGecko status {r.status_code}"
            except Exception as e:
                prices["error"] = str(e)

        # --- CRYPTOPANIC ---
        if not cryptopanic_token:
            news["error"] = "CRYPTOPANIC_TOKEN missing (showing fallback)"
            news["data"] = [{"title": "No CryptoPanic token configured", "published_at": None}]
        else:
            try:
                rn = await client.get(
                    "https://cryptopanic.com/api/developer/v2/posts/",
                    params={"auth_token": cryptopanic_token, "public": "true"},
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

        # --- OPENROUTER ---
        if not openrouter_key:
            insight["error"] = "OPENROUTER_API_KEY missing (showing fallback)"
            insight["data"] = "No AI key configured yet."
        else:
            try:
                prompt = (
                    f"Give ONE short crypto insight for a {investor_type}. "
                    f"Assets: {assets}. Keep under 40 words."
                )
                ai = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {openrouter_key}",
                        "Content-Type": "application/json",
                    },
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

    return {
        "preferences": prefs,
        "sections": {
            "prices": prices,
            "news": news,
            "ai_insight": insight,
            "meme": meme,
        },
    }

@app.post("/votes")
def vote(data: VoteReq, user_id: int = Depends(get_user_id)):
    if data.value not in (1, -1):
        raise HTTPException(400, "value must be 1 or -1")

    q = text("""
        INSERT INTO user_votes (user_id, section, item, value)
        VALUES (:user_id, :section, :item, :value)
        ON CONFLICT (user_id, section, item)
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
