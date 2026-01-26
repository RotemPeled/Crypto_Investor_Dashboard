import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL, future=True)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(BASE_DIR, "schema.sql")

def init_db():
    with engine.connect() as conn:
        with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
            conn.execute(text(f.read()))
        conn.commit()

def db_check():
    with engine.connect() as conn:
        return conn.execute(text("SELECT 1")).scalar()
