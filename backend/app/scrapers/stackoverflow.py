import httpx
import logging
from html import unescape
from datetime import datetime, timezone
from typing import List
from .base import SourceAdapter, RawResult
from ..config import settings
from ..rate_limiter import get_limiter, retry_with_backoff, check_se_backoff

logger = logging.getLogger(__name__)

SO_API_BASE = "https://api.stackexchange.com/2.3"


class StackOverflowAdapter(SourceAdapter):
    """Adapter for the public Stack Exchange API (v2.3)."""

    def __init__(self):
        self._limiter = get_limiter("stackoverflow")

    @property
    def name(self) -> str:
        return "stackoverflow"

    def is_configured(self) -> bool:
        # Public API works without a key; key just raises rate limit.
        return True

    async def test_connection(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                params = {"site": "stackoverflow", "pagesize": 1}
                if settings.STACKOVERFLOW_KEY:
                    params["key"] = settings.STACKOVERFLOW_KEY
                r = await client.get(f"{SO_API_BASE}/info", params=params)
                return r.status_code == 200
        except Exception as e:
            logger.warning("StackOverflow connection test failed: %s", e)
            return False

    async def search(self, query: str, limit: int = 5) -> List[RawResult]:
        results: List[RawResult] = []
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                # Search for relevant questions
                params = {
                    "order": "desc",
                    "sort": "relevance",
                    "intitle": query,
                    "site": "stackoverflow",
                    "pagesize": limit,
                    "filter": "withbody",
                }
                if settings.STACKOVERFLOW_KEY:
                    params["key"] = settings.STACKOVERFLOW_KEY

                resp = await retry_with_backoff(
                    client.get, f"{SO_API_BASE}/search/advanced",
                    params=params,
                    limiter=self._limiter,
                )
                resp.raise_for_status()

                # SE-specific: honour the `backoff` field in the JSON body
                await check_se_backoff(resp)

                questions = resp.json().get("items", [])

                for q in questions:
                    question_id = q["question_id"]
                    title = unescape(q.get("title", ""))
                    url = q.get("link", f"https://stackoverflow.com/q/{question_id}")
                    created = datetime.fromtimestamp(
                        q.get("creation_date", 0), tz=timezone.utc
                    )

                    # Fetch top answers for each question
                    body_parts = [unescape(q.get("body", ""))]
                    answer_score = q.get("score", 0)

                    ans_params = {
                        "order": "desc",
                        "sort": "votes",
                        "site": "stackoverflow",
                        "pagesize": 2,
                        "filter": "withbody",
                    }
                    if settings.STACKOVERFLOW_KEY:
                        ans_params["key"] = settings.STACKOVERFLOW_KEY

                    ans_resp = await retry_with_backoff(
                        client.get,
                        f"{SO_API_BASE}/questions/{question_id}/answers",
                        params=ans_params,
                        limiter=self._limiter,
                    )

                    # SE-specific: honour backoff on answer calls too
                    await check_se_backoff(ans_resp)

                    if ans_resp.status_code == 200:
                        answers = ans_resp.json().get("items", [])
                        for a in answers:
                            body_parts.append(unescape(a.get("body", "")))
                            answer_score = max(answer_score, a.get("score", 0))

                    results.append(
                        RawResult(
                            title=title,
                            url=url,
                            body="\n---\n".join(body_parts),
                            author=q.get("owner", {}).get("display_name", "unknown"),
                            score=float(answer_score),
                            created_at=created,
                            source_name=self.name,
                        )
                    )

        except Exception as e:
            logger.error("StackOverflow search failed: %s", e)

        return results
