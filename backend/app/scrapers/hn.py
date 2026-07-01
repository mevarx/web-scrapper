import httpx
import logging
from datetime import datetime, timezone
from typing import List
from .base import SourceAdapter, RawResult

logger = logging.getLogger(__name__)

ALGOLIA_HN_BASE = "https://hn.algolia.com/api/v1"
HN_ITEM_BASE = "https://hacker-news.firebaseio.com/v0"


class HackerNewsAdapter(SourceAdapter):
    """Adapter using the Algolia HN Search API for relevance search
    and the official Firebase HN API for item details."""

    @property
    def name(self) -> str:
        return "hn"

    def is_configured(self) -> bool:
        return True  # No auth required.

    async def test_connection(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(f"{ALGOLIA_HN_BASE}/search", params={"query": "test", "hitsPerPage": 1})
                return r.status_code == 200
        except Exception as e:
            logger.warning("HN connection test failed: %s", e)
            return False

    async def _fetch_top_comments(self, client: httpx.AsyncClient, story_id: int, limit: int = 3) -> str:
        """Fetch top-level comments from the Firebase HN API for richer context."""
        try:
            r = await client.get(f"{HN_ITEM_BASE}/item/{story_id}.json", timeout=5)
            if r.status_code != 200:
                return ""
            item = r.json()
            kid_ids = item.get("kids", [])[:limit]

            comments = []
            for kid_id in kid_ids:
                cr = await client.get(f"{HN_ITEM_BASE}/item/{kid_id}.json", timeout=5)
                if cr.status_code == 200:
                    cdata = cr.json()
                    if cdata and cdata.get("type") == "comment" and not cdata.get("deleted"):
                        text = cdata.get("text", "")
                        comments.append(text)
            return "\n---\n".join(comments)
        except Exception:
            return ""

    async def search(self, query: str, limit: int = 5) -> List[RawResult]:
        results: List[RawResult] = []
        try:
            async with httpx.AsyncClient(timeout=12) as client:
                # ── Algolia relevance search ──────────────────────
                params = {
                    "query": query,
                    "tags": "story",
                    "hitsPerPage": limit,
                }
                resp = await client.get(f"{ALGOLIA_HN_BASE}/search", params=params)
                resp.raise_for_status()
                hits = resp.json().get("hits", [])

                for hit in hits:
                    story_id = hit.get("objectID", "")
                    title = hit.get("title", "Untitled")
                    url = hit.get("url") or f"https://news.ycombinator.com/item?id={story_id}"
                    points = hit.get("points", 0) or 0
                    author = hit.get("author", "unknown")

                    # Parse creation date
                    created_str = hit.get("created_at", "")
                    try:
                        created = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                    except (ValueError, AttributeError):
                        created = datetime.now(tz=timezone.utc)

                    # Build body from story text + top comments
                    story_text = hit.get("story_text") or ""
                    comment_text = ""
                    if story_id:
                        comment_text = await self._fetch_top_comments(client, int(story_id))

                    body = story_text
                    if comment_text:
                        body = body + "\n\n### Top Comments:\n" + comment_text if body else comment_text

                    results.append(
                        RawResult(
                            title=title,
                            url=url,
                            body=body or title,  # Fallback to title if no body
                            author=author,
                            score=float(points),
                            created_at=created,
                            source_name=self.name,
                        )
                    )

        except Exception as e:
            logger.error("HN search failed: %s", e)

        return results
