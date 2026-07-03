import asyncio
import logging
from datetime import datetime, timezone
from typing import List
from urllib.parse import quote
from .base import SourceAdapter, RawResult
from ..config import settings
from ..rate_limiter import get_limiter

logger = logging.getLogger(__name__)


class MediumAdapter(SourceAdapter):
    """Adapter for Medium using Playwright headless scraping.

    ⚠️  Best-effort adapter — Medium has no public API and actively
    discourages scraping.  Selectors may break without notice.
    Disabled by default (ENABLE_MEDIUM_SCRAPING=false).
    """

    def __init__(self):
        self._limiter = get_limiter("medium")

    @property
    def name(self) -> str:
        return "medium"

    def is_configured(self) -> bool:
        return settings.ENABLE_MEDIUM_SCRAPING

    async def test_connection(self) -> bool:
        if not self.is_configured():
            return False
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as pw:
                browser = await pw.chromium.launch(headless=True)
                page = await browser.new_page()
                await self._limiter.acquire()
                await page.goto("https://medium.com", timeout=10000)
                title = await page.title()
                await browser.close()
                return bool(title)
        except Exception as e:
            logger.warning("Medium connection test failed: %s", e)
            return False

    async def search(self, query: str, limit: int = 5) -> List[RawResult]:
        if not self.is_configured():
            return []

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

                search_url = f"https://medium.com/search?q={quote(query)}"
                await self._limiter.acquire()
                await page.goto(search_url, wait_until="domcontentloaded", timeout=15000)

                # Configurable delay to respect rate limits
                await asyncio.sleep(2)

                # Attempt to parse article cards
                # Medium's DOM structure changes frequently;
                # we use multiple selector strategies with fallbacks.
                article_links = []

                # Strategy 1: <article> elements with links
                articles = await page.query_selector_all("article")
                for article in articles[:limit]:
                    try:
                        link_el = await article.query_selector("a[href*='medium.com']")
                        if not link_el:
                            link_el = await article.query_selector("a")
                        href = await link_el.get_attribute("href") if link_el else None

                        title_el = await article.query_selector("h2, h3")
                        title = await title_el.inner_text() if title_el else "Untitled"

                        snippet_el = await article.query_selector("p")
                        snippet = await snippet_el.inner_text() if snippet_el else ""

                        # Attempt clap/reaction extraction
                        clap_el = await article.query_selector("button[data-testid='clapButton'] span, .pw-multi-vote-count")
                        clap_text = await clap_el.inner_text() if clap_el else "0"
                        claps = _parse_metric(clap_text)

                        if href:
                            article_links.append({
                                "title": title,
                                "url": href if href.startswith("http") else f"https://medium.com{href}",
                                "body": snippet,
                                "claps": claps,
                            })
                    except Exception:
                        continue

                # Strategy 2: Fallback — generic link parsing
                if not article_links:
                    links = await page.query_selector_all("a[href*='medium.com']")
                    for link in links[:limit * 2]:
                        try:
                            href = await link.get_attribute("href")
                            text = await link.inner_text()
                            if href and len(text) > 20:  # Filter nav links
                                article_links.append({
                                    "title": text.strip()[:120],
                                    "url": href if href.startswith("http") else f"https://medium.com{href}",
                                    "body": text.strip(),
                                    "claps": 0,
                                })
                        except Exception:
                            continue

                await browser.close()

                # Deduplicate by URL
                seen_urls = set()
                for item in article_links[:limit]:
                    if item["url"] in seen_urls:
                        continue
                    seen_urls.add(item["url"])

                    results.append(
                        RawResult(
                            title=item["title"],
                            url=item["url"],
                            body=item["body"] or item["title"],
                            author="unknown",
                            score=float(item.get("claps", 0)),
                            created_at=datetime.now(tz=timezone.utc),
                            source_name=self.name,
                        )
                    )

        except ImportError:
            logger.error("Playwright not installed — Medium adapter unavailable.")
        except Exception as e:
            logger.error("Medium search failed: %s", e)

        return results


def _parse_metric(text: str) -> float:
    """Parse human-readable metric strings like '1.2K' → 1200."""
    text = text.strip().upper().replace(",", "")
    try:
        if text.endswith("K"):
            return float(text[:-1]) * 1000
        elif text.endswith("M"):
            return float(text[:-1]) * 1_000_000
        return float(text)
    except (ValueError, TypeError):
        return 0.0
