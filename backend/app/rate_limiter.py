"""Centralized rate-limiting infrastructure for Cited source adapters.

Provides:
  - TokenBucketLimiter : asyncio-based token-bucket with configurable rate/burst.
  - RateLimitState     : snapshot of remaining tokens & reset time for dashboards.
  - adaptive_wait()    : reads standard rate-limit response headers and adjusts.
  - retry_with_backoff(): wraps httpx calls with exponential backoff + jitter on 429/503.
  - Per-source Semaphore registry shared across concurrent queries.
"""

import asyncio
import logging
import random
import time
from dataclasses import dataclass, field
from typing import Dict, Optional, Callable, Any

import httpx

logger = logging.getLogger(__name__)

# Rate-limit state snapshot (for status dashboard)

@dataclass
class RateLimitState:
    """Immutable snapshot of a limiter's current state."""
    source_name: str
    tokens_remaining: float
    burst_max: float
    rate_per_sec: float
    is_throttled: bool
    last_refill: float  # epoch timestamp
    api_remaining: Optional[int] = None   # from API response headers
    api_reset_at: Optional[float] = None  # epoch from API response headers


# Token-bucket limiter

class TokenBucketLimiter:
    """Async token-bucket rate limiter.

    Parameters
    ----------
    source_name : str
        Human-readable source name (for logging/dashboard).
    rate : float
        Token refill rate (tokens per second).
    burst : int
        Maximum bucket capacity (burst allowance).
    """

    def __init__(self, source_name: str, rate: float, burst: int):
        self.source_name = source_name
        self.rate = rate
        self.burst = burst
        self._tokens: float = float(burst)
        self._last_refill: float = time.monotonic()
        self._lock = asyncio.Lock()

        # Adaptive state from API response headers
        self._api_remaining: Optional[int] = None
        self._api_reset_at: Optional[float] = None

    def _refill(self) -> None:
        """Add tokens based on elapsed time since last refill."""
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self.burst, self._tokens + elapsed * self.rate)
        self._last_refill = now

    async def acquire(self, tokens: int = 1) -> None:
        """Wait until *tokens* are available, then consume them."""
        while True:
            async with self._lock:
                self._refill()
                if self._tokens >= tokens:
                    self._tokens -= tokens
                    return

            # Not enough tokens — calculate wait time and sleep
            async with self._lock:
                self._refill()
                deficit = tokens - self._tokens
            wait = deficit / self.rate if self.rate > 0 else 1.0
            logger.debug(
                "Rate limiter [%s]: waiting %.2fs for %d token(s)",
                self.source_name, wait, tokens,
            )
            await asyncio.sleep(wait)

    def update_from_headers(self, headers: httpx.Headers) -> None:
        """Adaptively adjust based on standard rate-limit response headers.

        Reads:
          - X-RateLimit-Remaining / x-rate-limit-remaining
          - X-RateLimit-Reset / x-rate-limit-reset / Retry-After
        """
        remaining = (
            headers.get("x-ratelimit-remaining")
            or headers.get("x-rate-limit-remaining")
        )
        reset = (
            headers.get("x-ratelimit-reset")
            or headers.get("x-rate-limit-reset")
        )

        if remaining is not None:
            try:
                self._api_remaining = int(remaining)
            except (ValueError, TypeError):
                pass

        if reset is not None:
            try:
                # Could be epoch timestamp or seconds-from-now
                reset_val = float(reset)
                if reset_val > 1_000_000_000:  # epoch timestamp
                    self._api_reset_at = reset_val
                else:  # relative seconds
                    self._api_reset_at = time.time() + reset_val
            except (ValueError, TypeError):
                pass

        # If API says we're near exhaustion, temporarily reduce bucket tokens
        if self._api_remaining is not None and self._api_remaining <= 2:
            logger.warning(
                "Rate limiter [%s]: API reports only %d requests remaining",
                self.source_name, self._api_remaining,
            )
            self._tokens = min(self._tokens, float(self._api_remaining))

    def get_state(self) -> RateLimitState:
        """Return a snapshot for the status dashboard."""
        self._refill()
        return RateLimitState(
            source_name=self.source_name,
            tokens_remaining=round(self._tokens, 2),
            burst_max=float(self.burst),
            rate_per_sec=self.rate,
            is_throttled=self._tokens < 1.0,
            last_refill=self._last_refill,
            api_remaining=self._api_remaining,
            api_reset_at=self._api_reset_at,
        )


# Retry with exponential backoff + jitter

MAX_RETRIES = 3
BASE_DELAY = 1.0
BACKOFF_FACTOR = 2.0
RETRYABLE_STATUS_CODES = {429, 503}


async def retry_with_backoff(
    func: Callable[..., Any],
    *args: Any,
    limiter: Optional[TokenBucketLimiter] = None,
    max_retries: int = MAX_RETRIES,
    **kwargs: Any,
) -> httpx.Response:
    """Call *func* (an async callable returning an httpx.Response) with retry.

    On 429/503:
      - Reads Retry-After header if present.
      - Applies exponential backoff with jitter.
      - Respects *max_retries* cap so a single slow source cannot stall
        the entire asyncio.gather past the per-source timeout.

    On success or non-retryable error: returns/raises immediately.
    """
    last_exc: Optional[Exception] = None

    for attempt in range(max_retries + 1):
        if limiter is not None:
            await limiter.acquire()

        try:
            response: httpx.Response = await func(*args, **kwargs)

            # Feed rate-limit headers back to the limiter
            if limiter is not None:
                limiter.update_from_headers(response.headers)

            if response.status_code not in RETRYABLE_STATUS_CODES:
                return response

            # Retryable status code
            retry_after = response.headers.get("retry-after")
            if retry_after:
                try:
                    delay = float(retry_after)
                except ValueError:
                    delay = BASE_DELAY * (BACKOFF_FACTOR ** attempt)
            else:
                delay = BASE_DELAY * (BACKOFF_FACTOR ** attempt)

            # Add jitter (±25%)
            jitter = delay * 0.25 * (2 * random.random() - 1)
            delay = max(0.1, delay + jitter)

            if attempt < max_retries:
                logger.warning(
                    "Rate limiter: %d from %s (attempt %d/%d), retrying in %.1fs",
                    response.status_code,
                    response.url,
                    attempt + 1,
                    max_retries,
                    delay,
                )
                await asyncio.sleep(delay)
            else:
                # Max retries exhausted — return the error response
                logger.error(
                    "Rate limiter: %d from %s — max retries (%d) exhausted",
                    response.status_code,
                    response.url,
                    max_retries,
                )
                return response

        except httpx.HTTPStatusError as exc:
            last_exc = exc
            if exc.response.status_code in RETRYABLE_STATUS_CODES:
                delay = BASE_DELAY * (BACKOFF_FACTOR ** attempt)
                jitter = delay * 0.25 * (2 * random.random() - 1)
                delay = max(0.1, delay + jitter)
                if attempt < max_retries:
                    logger.warning(
                        "Rate limiter: HTTPStatusError %d (attempt %d/%d), retrying in %.1fs",
                        exc.response.status_code,
                        attempt + 1,
                        max_retries,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue
            raise

    # Should not reach here, but just in case
    if last_exc:
        raise last_exc
    raise RuntimeError("retry_with_backoff: unexpected exit")


# Stack Exchange-specific: read `backoff` from JSON body

async def check_se_backoff(response: httpx.Response) -> None:
    """Stack Exchange API returns a `backoff` field in the JSON body
    when it wants callers to slow down. If present, sleep that many seconds."""
    try:
        data = response.json()
        backoff_secs = data.get("backoff")
        if backoff_secs and isinstance(backoff_secs, (int, float)):
            logger.info(
                "StackExchange API requested backoff of %ds", backoff_secs
            )
            await asyncio.sleep(backoff_secs)
    except Exception:
        pass  # Non-JSON response or parse error — ignore


# Global limiter registry

# Default rate-limit configs per source.
# rate = tokens/second, burst = max bucket size.
DEFAULT_RATE_LIMITS: Dict[str, Dict[str, float]] = {
    "stackoverflow": {"rate": 0.5, "burst": 5},   # SE: 300/day without key
    "devto":         {"rate": 2.0, "burst": 5},    # Dev.to: ~10 req/30s
    "hn":            {"rate": 5.0, "burst": 10},   # Algolia HN: generous
    "twitter":       {"rate": 0.5, "burst": 3},    # Twitter v2: 450/15min
    "medium":        {"rate": 0.2, "burst": 1},    # Playwright: conservative
    "reddit":        {"rate": 1.0, "burst": 5},    # PRAW handles internally
}

# Module-level singletons — initialised lazily by get_limiter().
_limiters: Dict[str, TokenBucketLimiter] = {}
_semaphores: Dict[str, asyncio.Semaphore] = {}

# Default concurrency cap per source (across all concurrent queries).
DEFAULT_CONCURRENCY_PER_SOURCE = 2


def get_limiter(source_name: str) -> TokenBucketLimiter:
    """Return (or create) the singleton TokenBucketLimiter for *source_name*."""
    if source_name not in _limiters:
        cfg = DEFAULT_RATE_LIMITS.get(source_name, {"rate": 1.0, "burst": 5})
        _limiters[source_name] = TokenBucketLimiter(
            source_name=source_name,
            rate=cfg["rate"],
            burst=int(cfg["burst"]),
        )
    return _limiters[source_name]


def get_semaphore(source_name: str) -> asyncio.Semaphore:
    """Return (or create) the singleton per-source concurrency semaphore."""
    if source_name not in _semaphores:
        _semaphores[source_name] = asyncio.Semaphore(
            DEFAULT_CONCURRENCY_PER_SOURCE
        )
    return _semaphores[source_name]


def get_all_rate_limit_states() -> Dict[str, dict]:
    """Return rate-limit state for all known limiters (for /api/status)."""
    states = {}
    for name, limiter in _limiters.items():
        state = limiter.get_state()
        states[name] = {
            "tokens_remaining": state.tokens_remaining,
            "burst_max": state.burst_max,
            "rate_per_sec": state.rate_per_sec,
            "is_throttled": state.is_throttled,
            "api_remaining": state.api_remaining,
            "api_reset_at": state.api_reset_at,
        }
    return states
