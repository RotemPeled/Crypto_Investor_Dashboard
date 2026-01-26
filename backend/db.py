import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL, future=True)

def db_check():
    with engine.connect() as conn:
        return conn.execute(text("SELECT 1")).scalar()
