import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db, engine, Base
from .cache import (
    get_raw_cache,
    set_raw_cache,
    get_answer_cache,
    set_answer_cache,
    evict_expired,
)
from .ranking import rank_results
from .rag import RAGPipeline
from .sanitize import sanitize_error
from .rate_limiter import get_semaphore, get_all_rate_limit_states
from .scrapers.base import SourceAdapter, RawResult
from .scrapers.stackoverflow import StackOverflowAdapter
from .scrapers.devto import DevToAdapter
from .scrapers.hn import HackerNewsAdapter
from .scrapers.reddit import RedditAdapter
from .scrapers.medium import MediumAdapter
from .scrapers.twitter import TwitterAdapter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created / verified.")
    yield
    logger.info("Shutting down Cited backend.")


app = FastAPI(
    title="Cited Backend",
    version="1.0.0",
    description="Self-hosted multi-source answer aggregator API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALL_ADAPTERS: List[SourceAdapter] = [
    StackOverflowAdapter(),
    DevToAdapter(),
    HackerNewsAdapter(),
    RedditAdapter(),
    MediumAdapter(),
    TwitterAdapter(),
]

rag_pipeline = RAGPipeline()


class QueryRequest(BaseModel):
    query: str
    sources: Optional[List[str]] = None


class SettingsUpdate(BaseModel):
    gemini_model: Optional[str] = None
    raw_cache_ttl: Optional[int] = None
    answer_cache_ttl: Optional[int] = None


PER_SOURCE_TIMEOUT = 10.0  # seconds

async def _run_scraper(
    adapter: SourceAdapter,
    query: str,
    db: Session,
) -> tuple[str, List[RawResult], Optional[str]]:
    """Execute one scraper with semaphore gate, cache check, timeout, and error isolation.

    Returns (source_name, results, error_message_or_None).
    """
    semaphore = get_semaphore(adapter.name)
    async with semaphore:
        cached = get_raw_cache(db, query, adapter.name)
        if cached is not None:
            return (adapter.name, cached, None)

        try:
            results = await asyncio.wait_for(
                adapter.search(query), timeout=PER_SOURCE_TIMEOUT
            )
            if results:
                set_raw_cache(db, query, adapter.name, results)
            return (adapter.name, results, None)
        except asyncio.TimeoutError:
            msg = f"{adapter.name} timed out after {PER_SOURCE_TIMEOUT}s"
            logger.warning(msg)
            return (adapter.name, [], msg)
        except Exception as e:
            msg = f"{adapter.name} failed: {sanitize_error(str(e))}"
            logger.error(msg)
            return (adapter.name, [], msg)


@app.get("/api/status")
async def get_status():
    """Health check: reports configured/authenticated state per source."""
    report = {}
    for adapter in ALL_ADAPTERS:
        configured = adapter.is_configured()
        authenticated = False
        if configured:
            try:
                authenticated = await asyncio.wait_for(
                    adapter.test_connection(), timeout=8
                )
            except Exception:
                authenticated = False
        report[adapter.name] = {
            "configured": configured,
            "authenticated": authenticated,
        }
    return report


@app.get("/api/rate-limits")
def get_rate_limits():
    """Return current rate-limit state for all source limiters."""
    return get_all_rate_limit_states()


@app.post("/api/query")
async def execute_query(payload: QueryRequest, db: Session = Depends(get_db)):
    """Main query endpoint: scrape → rank → RAG → respond."""
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    if payload.sources:
        enabled = [s.lower() for s in payload.sources]
    else:
        enabled = [a.name for a in ALL_ADAPTERS if a.is_configured()]

    if not enabled:
        raise HTTPException(
            status_code=400,
            detail="No sources are configured. Add API keys in .env.",
        )

    cached_answer = get_answer_cache(db, query, enabled)
    if cached_answer:
        return cached_answer

    active_adapters = [a for a in ALL_ADAPTERS if a.name in enabled]
    tasks = [_run_scraper(a, query, db) for a in active_adapters]
    scrape_results = await asyncio.gather(*tasks)

    all_results: List[RawResult] = []
    source_errors: dict = {}
    for source_name, results, error in scrape_results:
        all_results.extend(results)
        if error:
            source_errors[source_name] = error

    if not all_results:
        return {
            "query": query,
            "answer": "No results were returned from any source.",
            "citations": [],
            "raw_results": [],
            "source_errors": source_errors,
            "cached": False,
        }

    ranked = rank_results(all_results)
    rag_response = await rag_pipeline.generate_answer(query, ranked)

    set_answer_cache(
        db,
        query,
        enabled,
        rag_response["answer"],
        rag_response["citations"],
        [r for r in ranked[:20]],
    )

    return {
        "query": query,
        "answer": rag_response["answer"],
        "citations": rag_response["citations"],
        "raw_results": ranked[:20],
        "source_errors": source_errors,
        "cached": False,
    }


@app.get("/api/settings")
def get_settings():
    """Return current runtime configuration (safe — no API keys exposed)."""
    return {
        "gemini_model": settings.GEMINI_MODEL,
        "raw_cache_ttl": settings.RAW_CACHE_TTL,
        "answer_cache_ttl": settings.ANSWER_CACHE_TTL,
        "enable_medium": settings.ENABLE_MEDIUM_SCRAPING,
        "enable_twitter": settings.ENABLE_TWITTER_SCRAPING,
        "sources": {
            a.name: {"configured": a.is_configured()} for a in ALL_ADAPTERS
        },
    }


@app.post("/api/settings")
def update_settings(update: SettingsUpdate):
    """Update runtime config (in-memory only — does not write .env)."""
    if update.gemini_model:
        settings.GEMINI_MODEL = update.gemini_model
    if update.raw_cache_ttl is not None:
        settings.RAW_CACHE_TTL = update.raw_cache_ttl
    if update.answer_cache_ttl is not None:
        settings.ANSWER_CACHE_TTL = update.answer_cache_ttl
    return {"status": "ok", "updated": update.model_dump(exclude_none=True)}


@app.post("/api/cache/clear")
def clear_cache(db: Session = Depends(get_db)):
    """Evict all expired cache entries."""
    deleted = evict_expired(db)
    return {"status": "ok", "evicted": deleted}
