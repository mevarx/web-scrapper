import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy.orm import Session
from .models import RawCache, AnswerCache
from .scrapers.base import RawResult
from .config import settings

logger = logging.getLogger(__name__)


def normalize_query(query: str) -> str:
    """Lowercase, strip, collapse whitespace for consistent hashing."""
    return " ".join(query.lower().strip().split())


def make_query_hash(query: str, sources: Optional[List[str]] = None) -> str:
    """Create deterministic hash for cache keying."""
    key = normalize_query(query)
    if sources:
        key += "|" + ",".join(sorted(sources))
    return hashlib.md5(key.encode()).hexdigest()


def get_raw_cache(db: Session, query: str, source_name: str) -> Optional[List[RawResult]]:
    """Return cached raw results for a single source if still within TTL."""
    q_hash = make_query_hash(query, [source_name])
    cutoff = datetime.utcnow() - timedelta(seconds=settings.RAW_CACHE_TTL)

    row = (
        db.query(RawCache)
        .filter(
            RawCache.query_hash == q_hash,
            RawCache.source_name == source_name,
            RawCache.fetched_at >= cutoff,
        )
        .order_by(RawCache.fetched_at.desc())
        .first()
    )
    if row is None:
        return None

    logger.info("Raw cache HIT for source=%s hash=%s", source_name, q_hash)
    return [RawResult(**item) for item in json.loads(row.results_json)]


def set_raw_cache(
    db: Session, query: str, source_name: str, results: List[RawResult]
) -> None:
    """Persist raw results for a source."""
    q_hash = make_query_hash(query, [source_name])
    payload = json.dumps(
        [r.model_dump(mode="json") for r in results], default=str
    )
    row = RawCache(
        query_hash=q_hash,
        source_name=source_name,
        results_json=payload,
        fetched_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    logger.info("Raw cache SET for source=%s hash=%s (%d results)", source_name, q_hash, len(results))


def get_answer_cache(db: Session, query: str, sources: List[str]) -> Optional[dict]:
    """Return cached synthesized answer if still within TTL."""
    q_hash = make_query_hash(query, sources)
    cutoff = datetime.utcnow() - timedelta(seconds=settings.ANSWER_CACHE_TTL)

    row = (
        db.query(AnswerCache)
        .filter(
            AnswerCache.query_hash == q_hash,
            AnswerCache.fetched_at >= cutoff,
        )
        .order_by(AnswerCache.fetched_at.desc())
        .first()
    )
    if row is None:
        return None

    logger.info("Answer cache HIT hash=%s", q_hash)
    return {
        "query": row.query_text,
        "answer": row.answer_text,
        "citations": json.loads(row.citations_json),
        "raw_results": json.loads(row.raw_results_json),
        "cached": True,
    }


def set_answer_cache(
    db: Session,
    query: str,
    sources: List[str],
    answer_text: str,
    citations: list,
    raw_results: list,
) -> None:
    """Persist a synthesized answer."""
    q_hash = make_query_hash(query, sources)
    row = AnswerCache(
        query_hash=q_hash,
        query_text=query,
        answer_text=answer_text,
        citations_json=json.dumps(citations, default=str),
        raw_results_json=json.dumps(raw_results, default=str),
        fetched_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()
    logger.info("Answer cache SET hash=%s", q_hash)


def evict_expired(db: Session) -> int:
    """Remove all expired rows from both cache tables. Returns count deleted."""
    now = datetime.utcnow()

    raw_cutoff = now - timedelta(seconds=settings.RAW_CACHE_TTL)
    raw_deleted = db.query(RawCache).filter(RawCache.fetched_at < raw_cutoff).delete()

    ans_cutoff = now - timedelta(seconds=settings.ANSWER_CACHE_TTL)
    ans_deleted = db.query(AnswerCache).filter(AnswerCache.fetched_at < ans_cutoff).delete()

    db.commit()
    total = raw_deleted + ans_deleted
    if total:
        logger.info("Evicted %d expired cache rows (raw=%d, answer=%d)", total, raw_deleted, ans_deleted)
    return total
