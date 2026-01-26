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


load_dotenv()
app = FastAPI()

bearer = HTTPBearer()

@app.get("/health")
def health():
    return {"status": "ok"}

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



# saving new user in DB
@app.post("/auth/signup")
def signup(data: SignupReq):
    hashed_password = bcrypt.hashpw(
        data.password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")
    query = text("INSERT INTO users (name, email, password_hash) VALUES (:name, :email, :password_hash) RETURNING id")
    
    with engine.connect() as conn:
        try:
            result = conn.execute(query, {"name": data.name, "password_hash": hashed_password, "email": data.email})
            conn.commit()
            user_id = result.scalar()
        except Exception:
            raise HTTPException(400, "User already exists")

    return {"message": "user has been created successfully", "user_id": user_id}

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


# @app.get("/onboarding")

# @app.post("/votes")
