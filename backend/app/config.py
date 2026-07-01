import os
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    GEMINI_API_KEY: str
    GEMINI_MODEL: str = "gemini-1.5-flash"

    # Optional APIs
    REDDIT_CLIENT_ID: Optional[str] = None
    REDDIT_CLIENT_SECRET: Optional[str] = None
    REDDIT_USER_AGENT: Optional[str] = "python:answerai:v1.0.0"

    DEVTO_API_KEY: Optional[str] = None
    STACKOVERFLOW_KEY: Optional[str] = None
    TWITTER_BEARER_TOKEN: Optional[str] = None

    # Toggles
    ENABLE_MEDIUM_SCRAPING: bool = False
    ENABLE_TWITTER_SCRAPING: bool = False

    # Cache
    RAW_CACHE_TTL: int = 21600  # 6 hours
    ANSWER_CACHE_TTL: int = 3600  # 1 hour
    DATABASE_URL: str = "sqlite:///./answerai.db"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
