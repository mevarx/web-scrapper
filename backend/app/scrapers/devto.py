import httpx
import logging
from datetime import datetime, timezone
from typing import List
from .base import SourceAdapter, RawResult
from ..config import settings
from ..rate_limiter import get_limiter, retry_with_backoff

logger = logging.getLogger(__name__)

DEVTO_API_BASE = "https://dev.to/api"


class DevToAdapter(SourceAdapter):
    """Adapter for the public Dev.to REST API."""

    def __init__(self):
        self._limiter = get_limiter("devto")

    @property
    def name(self) -> str:
        return "devto"

    def is_configured(self) -> bool:
        return True  # Public API; key is optional for higher rate limits.

    async def test_connection(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                headers = {}
                if settings.DEVTO_API_KEY:
                    headers["api-key"] = settings.DEVTO_API_KEY
                r = await client.get(f"{DEVTO_API_BASE}/articles", params={"per_page": 1}, headers=headers)
                return r.status_code == 200
        except Exception as e:
            logger.warning("Dev.to connection test failed: %s", e)
            return False

    async def search(self, query: str, limit: int = 5) -> List[RawResult]:
        results: List[RawResult] = []
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                headers = {}
                if settings.DEVTO_API_KEY:
                    headers["api-key"] = settings.DEVTO_API_KEY

                # Search articles (tag-based)
                search_resp = await retry_with_backoff(
                    client.get,
                    f"{DEVTO_API_BASE}/articles",
                    params={"per_page": limit, "tag": query.replace(" ", "")},
                    headers=headers,
                    limiter=self._limiter,
                )

                # Also try the more generic search route
                generic_resp = await retry_with_backoff(
                    client.get,
                    "https://dev.to/search/feed_content",
                    params={"per_page": limit, "search_fields": query, "class_name": "Article"},
                    headers=headers,
                    limiter=self._limiter,
                )

                articles = []
                if search_resp.status_code == 200:
                    articles.extend(search_resp.json()[:limit])
                if generic_resp.status_code == 200:
                    generic_data = generic_resp.json()
                    if isinstance(generic_data, dict):
                        articles.extend(generic_data.get("result", [])[:limit])
                    elif isinstance(generic_data, list):
                        articles.extend(generic_data[:limit])

                # Deduplicate by id
                seen_ids = set()
                unique_articles = []
                for a in articles:
                    aid = a.get("id")
                    if aid and aid not in seen_ids:
                        seen_ids.add(aid)
                        unique_articles.append(a)

                for article in unique_articles[:limit]:
                    # Fetch full article body if available
                    body = article.get("body_markdown") or article.get("description", "")

                    # If we only have description, try fetching the full article
                    if not article.get("body_markdown") and article.get("id"):
                        try:
                            full_resp = await retry_with_backoff(
                                client.get,
                                f"{DEVTO_API_BASE}/articles/{article['id']}",
                                headers=headers,
                                limiter=self._limiter,
                            )
                            if full_resp.status_code == 200:
                                full_data = full_resp.json()
                                body = full_data.get("body_markdown", body)
                        except Exception:
                            pass  # Use description fallback

                    published = article.get("published_at") or article.get("created_at", "")
                    try:
                        created = datetime.fromisoformat(published.replace("Z", "+00:00"))
                    except (ValueError, AttributeError):
                        created = datetime.now(tz=timezone.utc)

                    results.append(
                        RawResult(
                            title=article.get("title", "Untitled"),
                            url=article.get("url", article.get("path", "")),
                            body=body,
                            author=article.get("user", {}).get("username", "unknown"),
                            score=float(article.get("positive_reactions_count", 0)),
                            created_at=created,
                            source_name=self.name,
                        )
                    )

        except Exception as e:
            logger.error("Dev.to search failed: %s", e)

        return results
