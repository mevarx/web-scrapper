import math
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict
from .scrapers.base import RawResult

logger = logging.getLogger(__name__)

# ── Default source weights (configurable via settings later) ─────────
DEFAULT_WEIGHTS: Dict[str, float] = {
    "stackoverflow": 1.0,
    "devto": 0.85,
    "reddit": 0.70,
    "medium": 0.60,
    "hn": 0.55,
    "twitter": 0.40,
}

# ── Normalization ceilings per source ────────────────────────────────
# These represent the "high watermark" raw score at which a result
# is considered maximally engaged for its platform.
SCORE_CEILINGS: Dict[str, float] = {
    "stackoverflow": 50.0,
    "reddit": 200.0,
    "hn": 100.0,
    "twitter": 50.0,
    "medium": 500.0,
    "devto": 100.0,
}

# Recency decay rate — small λ means very soft decay
RECENCY_LAMBDA = 0.002


def normalize_score(raw_score: float, source_name: str) -> float:
    """Map a platform-specific engagement metric to [0, 1].

    Uses a ceiling-based normalization where the ceiling represents
    the score at which a result is considered "maximally engaged"
    for that platform.  Values above the ceiling are clamped to 1.0.
    """
    ceiling = SCORE_CEILINGS.get(source_name, 100.0)
    if ceiling <= 0:
        return 0.5
    return min(max(raw_score, 0) / ceiling, 1.0)


def recency_decay(created_at: datetime) -> float:
    """Exponential soft decay based on age in days.

    Returns a multiplier in (0, 1] where:
      - Brand new  →  ~1.0
      - 30 days    →  ~0.94
      - 365 days   →  ~0.48
      - 1000 days  →  ~0.14
    """
    now = datetime.now(tz=timezone.utc)
    # Make created_at timezone-aware if it isn't
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    age_days = max((now - created_at).total_seconds() / 86400, 0)
    return math.exp(-RECENCY_LAMBDA * age_days)


def rank_results(
    results: List[RawResult],
    weights: Optional[Dict[str, float]] = None,
) -> List[dict]:
    """Score, sort, and return results as dicts with computed `final_score`.

    Formula:
        final_score = W_source × S_norm × D_recency

    Returns a list of dicts (RawResult fields + final_score) sorted
    descending by final_score.
    """
    active_weights = weights or DEFAULT_WEIGHTS
    scored: List[dict] = []

    for item in results:
        w = active_weights.get(item.source_name, 0.5)
        s_norm = normalize_score(item.score, item.source_name)
        d = recency_decay(item.created_at)
        final = w * s_norm * d

        entry = item.model_dump(mode="json")
        entry["final_score"] = round(final, 6)
        scored.append(entry)

    scored.sort(key=lambda x: x["final_score"], reverse=True)
    logger.info(
        "Ranked %d results — top score: %.4f, bottom score: %.4f",
        len(scored),
        scored[0]["final_score"] if scored else 0,
        scored[-1]["final_score"] if scored else 0,
    )
    return scored
