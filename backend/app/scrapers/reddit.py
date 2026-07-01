import praw
import asyncio
import logging
from datetime import datetime, timezone
from typing import List
from .base import SourceAdapter, RawResult
from ..config import settings

logger = logging.getLogger(__name__)


class RedditAdapter(SourceAdapter):
    """Adapter for Reddit using PRAW (Python Reddit API Wrapper).
    Requires client_id + client_secret for a read-only script-type app."""

    @property
    def name(self) -> str:
        return "reddit"

    def _get_client(self) -> praw.Reddit:
        return praw.Reddit(
            client_id=settings.REDDIT_CLIENT_ID,
            client_secret=settings.REDDIT_CLIENT_SECRET,
            user_agent=settings.REDDIT_USER_AGENT or "python:answerai:v1.0.0",
        )

    def is_configured(self) -> bool:
        return bool(settings.REDDIT_CLIENT_ID and settings.REDDIT_CLIENT_SECRET)

    async def test_connection(self) -> bool:
        if not self.is_configured():
            return False
        try:
            # PRAW is synchronous — run in executor
            loop = asyncio.get_event_loop()
            reddit = self._get_client()
            await loop.run_in_executor(None, lambda: reddit.subreddit("test").id)
            return True
        except Exception as e:
            logger.warning("Reddit connection test failed: %s", e)
            return False

    async def search(self, query: str, limit: int = 5) -> List[RawResult]:
        if not self.is_configured():
            return []

        results: List[RawResult] = []
        try:
            loop = asyncio.get_event_loop()

            def _blocking_search():
                reddit = self._get_client()
                posts = []
                # Search across all subreddits sorted by relevance
                for submission in reddit.subreddit("all").search(
                    query, sort="relevance", syntax="plain", limit=limit
                ):
                    # Gather top comments as supplementary context
                    submission.comment_sort = "best"
                    submission.comments.replace_more(limit=0)
                    top_comments = []
                    for comment in submission.comments[:3]:
                        if hasattr(comment, "body"):
                            top_comments.append(comment.body)

                    body = submission.selftext or ""
                    if top_comments:
                        body += "\n\n### Top Comments:\n" + "\n---\n".join(top_comments)

                    created = datetime.fromtimestamp(
                        submission.created_utc, tz=timezone.utc
                    )

                    # Reddit score is upvote-weighted
                    raw_score = submission.score
                    upvote_ratio = getattr(submission, "upvote_ratio", 0.5)

                    posts.append(
                        RawResult(
                            title=submission.title,
                            url=f"https://reddit.com{submission.permalink}",
                            body=body or submission.title,
                            author=str(getattr(submission, "author", "unknown")),
                            score=float(raw_score * upvote_ratio),
                            created_at=created,
                            source_name="reddit",
                        )
                    )
                return posts

            results = await loop.run_in_executor(None, _blocking_search)

        except Exception as e:
            logger.error("Reddit search failed: %s", e)

        return results
