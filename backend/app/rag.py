import re
import logging
from typing import List, Dict, Any
import google.generativeai as genai
from .config import settings

logger = logging.getLogger(__name__)


class RAGPipeline:
    """Retrieve → Chunk → Rank → Generate with citations.

    Accepts pre-ranked results (dicts with final_score) and produces
    a markdown answer with inline citation markers [1], [2], …
    """

    def __init__(self):
        if settings.GEMINI_API_KEY:
            genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model_name = settings.GEMINI_MODEL

    # ── Chunking ──────────────────────────────────────────────────────

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 400, overlap: int = 50) -> List[str]:
        """Split text into overlapping word-level chunks of ~chunk_size words."""
        words = text.split()
        if len(words) <= chunk_size:
            return [text] if text.strip() else []

        chunks: List[str] = []
        start = 0
        while start < len(words):
            end = start + chunk_size
            chunk = " ".join(words[start:end])
            if chunk.strip():
                chunks.append(chunk)
            start += chunk_size - overlap

        return chunks

    # ── Context selection ─────────────────────────────────────────────

    @staticmethod
    def select_top_k(ranked_results: List[dict], k: int = 8) -> List[dict]:
        """Pick the top-K results for the prompt context window."""
        return ranked_results[:k]

    # ── Prompt construction ───────────────────────────────────────────

    @staticmethod
    def build_prompt(query: str, context: List[dict]) -> str:
        """Construct a citation-aware system + user prompt."""
        references = ""
        for i, item in enumerate(context, start=1):
            title = item.get("title", "Untitled")
            source = item.get("source_name", "unknown")
            url = item.get("url", "")
            body = item.get("body", "")[:1500]  # Trim long bodies
            references += (
                f"[{i}] Title: {title}\n"
                f"    Source: {source}\n"
                f"    URL: {url}\n"
                f"    Content:\n{body}\n\n"
            )

        prompt = (
            "You are AnswerAI, a developer-focused answer engine.\n\n"
            "## Instructions\n"
            "Synthesize a comprehensive, accurate answer to the question below "
            "using ONLY the provided references.\n"
            "- For every factual claim, cite the source by its index in square brackets "
            "(e.g. [1], [2]).\n"
            "- Do NOT invent or hallucinate sources beyond the provided index range.\n"
            "- Use markdown formatting for readability (headings, code blocks, lists).\n"
            "- If the references are insufficient to answer, say so explicitly.\n\n"
            f"## Question\n{query}\n\n"
            f"## References\n{references}\n"
            "## Your Answer\n"
        )
        return prompt

    # ── Citation validation ───────────────────────────────────────────

    @staticmethod
    def validate_citations(answer: str, source_count: int) -> tuple[bool, List[int]]:
        """Verify every [n] marker maps to a real reference index.

        Returns (is_valid, list_of_invalid_indices).
        """
        cited = [int(m) for m in re.findall(r"\[(\d+)\]", answer)]
        invalid = [idx for idx in cited if idx < 1 or idx > source_count]
        return (len(invalid) == 0, invalid)

    @staticmethod
    def build_correction_prompt(
        original_answer: str, invalid_indices: List[int], source_count: int
    ) -> str:
        """Build a one-shot corrective prompt when citation indices are bad."""
        return (
            "Your previous answer contained citation indices that do not exist "
            f"in the provided references. The invalid indices are: {invalid_indices}.\n"
            f"Valid citation indices are [1] through [{source_count}].\n\n"
            "Please rewrite your answer below, correcting all invalid citations "
            "so every [n] is within the valid range. Preserve the content and "
            "markdown formatting.\n\n"
            f"## Previous Answer\n{original_answer}\n\n"
            "## Corrected Answer\n"
        )

    # ── Generation ────────────────────────────────────────────────────

    async def generate_answer(
        self, query: str, ranked_results: List[dict]
    ) -> Dict[str, Any]:
        """Full RAG flow: select context → prompt → generate → validate."""
        context = self.select_top_k(ranked_results)
        if not context:
            return {
                "answer": "No relevant sources were found to generate an answer.",
                "citations": [],
                "context_used": 0,
            }

        # Build citations metadata for the UI
        citations = []
        for i, item in enumerate(context, start=1):
            citations.append({
                "index": i,
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "source": item.get("source_name", ""),
                "score": item.get("final_score", 0),
            })

        # ── Call Gemini ───────────────────────────────────────────────
        prompt = self.build_prompt(query, context)
        try:
            model = genai.GenerativeModel(self.model_name)
            response = model.generate_content(prompt)
            answer_text = response.text
        except Exception as e:
            logger.error("Gemini generation failed: %s", e)
            return {
                "answer": f"LLM generation failed: {str(e)}. Showing raw sources instead.",
                "citations": citations,
                "context_used": len(context),
                "error": True,
            }

        # ── Validate citations ────────────────────────────────────────
        is_valid, invalid = self.validate_citations(answer_text, len(context))
        if not is_valid:
            logger.warning("Invalid citations detected: %s — attempting correction", invalid)
            correction_prompt = self.build_correction_prompt(
                answer_text, invalid, len(context)
            )
            try:
                model = genai.GenerativeModel(self.model_name)
                retry_response = model.generate_content(correction_prompt)
                corrected = retry_response.text
                is_valid_2, invalid_2 = self.validate_citations(corrected, len(context))
                if is_valid_2:
                    answer_text = corrected
                    logger.info("Citation correction succeeded on retry.")
                else:
                    logger.warning(
                        "Citation correction failed on second attempt (still invalid: %s). "
                        "Returning best-effort answer.", invalid_2
                    )
                    # Use corrected anyway — it's likely closer
                    answer_text = corrected
            except Exception as e:
                logger.error("Correction re-prompt failed: %s", e)

        return {
            "answer": answer_text,
            "citations": citations,
            "context_used": len(context),
        }
