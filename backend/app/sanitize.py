"""Error message sanitization to prevent secret leakage in API responses.

Strips patterns that look like API keys, bearer tokens, or credentials
before they reach the frontend or logs visible to end-users.
"""

import re
from typing import Optional

# ── Patterns that look like secrets ──────────────────────────────────
_SECRET_PATTERNS = [
    re.compile(r"AIza[0-9A-Za-z\-_]{35}"),           # Google API keys
    re.compile(r"sk-[A-Za-z0-9]{20,}"),               # OpenAI-style keys
    re.compile(r"ghp_[A-Za-z0-9]{36}"),                # GitHub PATs
    re.compile(r"Bearer\s+[A-Za-z0-9\-_.~+/]{20,}"),  # Bearer tokens
    re.compile(r"[A-Fa-f0-9]{32,}"),                   # Long hex strings (generic API keys)
    re.compile(r"(?:key|token|secret|password|credential)[\s=:]+\S{8,}", re.IGNORECASE),
]

# Max length for sanitized error messages
MAX_ERROR_LENGTH = 200


def sanitize_error(message: Optional[str]) -> str:
    """Sanitize an error message by redacting potential secrets.

    - Replaces strings matching known API key / token patterns with [REDACTED].
    - Truncates to MAX_ERROR_LENGTH characters.
    - Returns a generic message if the entire string appears to be a secret.
    """
    if not message:
        return "An internal error occurred."

    sanitized = str(message)

    # Replace each secret pattern with [REDACTED]
    for pattern in _SECRET_PATTERNS:
        sanitized = pattern.sub("[REDACTED]", sanitized)

    # If the entire message was redacted or is suspiciously short after redaction,
    # return a generic message
    if sanitized.strip() == "[REDACTED]" or not sanitized.strip():
        return "An internal error occurred."

    # Truncate to prevent overly verbose error messages
    if len(sanitized) > MAX_ERROR_LENGTH:
        sanitized = sanitized[:MAX_ERROR_LENGTH] + "..."

    return sanitized
