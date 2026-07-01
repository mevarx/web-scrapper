import asyncio
import httpx
import logging
from datetime import datetime, timezone
from typing import List
from .base import SourceAdapter, RawResult
from ..config import settings

logger = logging.getLogger(__name__)

TWITTER_API_BASE = "https://api.twitter.com/2"


class TwitterAdapter(SourceAdapter):
    """Adapter for Twitter/X.

    Primary path:  Twitter API v2 with Bearer token.
    Fallback:      Playwright headless scrape (best-effort, unstable).

    ⚠️  Both paths are fragile — API access tiers frequently change
    and scraping is actively blocked.  Disabled by default.
    """

    @property
    def name(self) -> str:
        return "twitter"

    def _has_api_key(self) -> bool:
        return bool(settings.TWITTER_BEARER_TOKEN)

    def is_configured(self) -> bool:
        return self._has_api_key() or settings.ENABLE_TWITTER_SCRAPING

    async def test_connection(self) -> bool:
        if not self.is_configured():
            return False
        if self._has_api_key():
            return await self._test_api()
        return await self._test_playwright()

    async def _test_api(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                headers = {"Authorization": f"Bearer {settings.TWITTER_BEARER_TOKEN}"}
                r = await client.get(
                    f"{TWITTER_API_BASE}/tweets/search/recent",
                    params={"query": "test", "max_results": 10},
                    headers=headers,
                )
                return r.status_code == 200
        except Exception as e:
            logger.warning("Twitter API test failed: %s", e)
            return False

    async def _test_playwright(self) -> bool:
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as pw:
                browser = await pw.chromium.launch(headless=True)
                page = await browser.new_page()
                await page.goto("https://x.com", timeout=10000)
                title = await page.title()
                await browser.close()
                return bool(title)
        except Exception as e:
            logger.warning("Twitter Playwright test failed: %s", e)
            return False

    # ── Search Methods ────────────────────────────────────────────────

    async def search(self, query: str, limit: int = 5) -> List[RawResult]:
        if not self.is_configured():
            return []

        if self._has_api_key():
            return await self._search_api(query, limit)
        return await self._search_playwright(query, limit)

    async def _search_api(self, query: str, limit: int) -> List[RawResult]:
        """Search using the official Twitter API v2 Recent Search endpoint."""
        results: List[RawResult] = []
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                headers = {"Authorization": f"Bearer {settings.TWITTER_BEARER_TOKEN}"}
                params = {
                    "query": f"{query} -is:retweet lang:en",
                    "max_results": min(limit, 100),
                    "tweet.fields": "created_at,public_metrics,author_id,text",
                    "expansions": "author_id",
                    "user.fields": "username",
                }
                resp = await client.get(
                    f"{TWITTER_API_BASE}/tweets/search/recent",
                    params=params,
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()

                tweets = data.get("data", [])
                # Build author lookup
                users = {}
                for u in data.get("includes", {}).get("users", []):
                    users[u["id"]] = u.get("username", "unknown")

                for tweet in tweets[:limit]:
                    tweet_id = tweet["id"]
                    text = tweet.get("text", "")
                    metrics = tweet.get("public_metrics", {})
                    likes = metrics.get("like_count", 0)
                    author_id = tweet.get("author_id", "")
                    username = users.get(author_id, "unknown")

                    created_str = tweet.get("created_at", "")
                    try:
                        created = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                    except (ValueError, AttributeError):
                        created = datetime.now(tz=timezone.utc)

                    results.append(
                        RawResult(
                            title=text[:100],
                            url=f"https://x.com/{username}/status/{tweet_id}",
                            body=text,
                            author=username,
                            score=float(likes),
                            created_at=created,
                            source_name=self.name,
                        )
                    )
        except Exception as e:
            logger.error("Twitter API search failed: %s", e)

        return results

    async def _search_playwright(self, query: str, limit: int) -> List[RawResult]:
        """Fallback headless scrape of X search — highly unstable."""
        results: List[RawResult] = []
        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as pw:
                browser = await pw.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                              "AppleWebKit/537.36 (KHTML, like Gecko) "
                              "Chrome/120.0.0.0 Safari/537.36"
                )
                page = await context.new_page()

                search_url = f"https://x.com/search?q={query}&src=typed_query&f=top"
                await page.goto(search_url, wait_until="domcontentloaded", timeout=15000)
                await asyncio.sleep(3)  # Wait for JS rendering

                # Attempt to parse tweet elements
                tweet_els = await page.query_selector_all("article[data-testid='tweet']")
                for el in tweet_els[:limit]:
                    try:
                        text_el = await el.query_selector("div[data-testid='tweetText']")
                        text = await text_el.inner_text() if text_el else ""

                        link_el = await el.query_selector("a[href*='/status/']")
                        href = await link_el.get_attribute("href") if link_el else ""
                        url = f"https://x.com{href}" if href and not href.startswith("http") else (href or "")

                        username_el = await el.query_selector("div[data-testid='User-Name'] a span")
                        username = await username_el.inner_text() if username_el else "unknown"

                        results.append(
                            RawResult(
                                title=text[:100] if text else "Tweet",
                                url=url,
                                body=text or "No content",
                                author=username,
                                score=0.0,  # Can't reliably extract likes from DOM
                                created_at=datetime.now(tz=timezone.utc),
                                source_name=self.name,
                            )
                        )
                    except Exception:
                        continue

                await browser.close()

        except ImportError:
            logger.error("Playwright not installed — Twitter fallback unavailable.")
        except Exception as e:
            logger.error("Twitter Playwright search failed: %s", e)

        return results
