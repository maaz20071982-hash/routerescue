import html
import re
from typing import Optional
from fastapi import Header, HTTPException, status
from app.config import ADMIN_API_KEY

def sanitize_text(text: Optional[str]) -> str:
    """
    Sanitizes user input string by stripping surrounding whitespace,
    removing null bytes, and HTML-escaping potentially unsafe characters.
    """
    if not text:
        return ""
    # Strip null bytes and normalize whitespace
    cleaned = text.replace("\x00", "").strip()
    # HTML escape dangerous characters (<, >, &, ", ')
    sanitized = html.escape(cleaned, quote=True)
    return sanitized

def verify_admin_key(
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> bool:
    """
    Protects privileged administrative endpoints (such as status updates).
    Validates either the X-Admin-Key header or Bearer token against configured ADMIN_API_KEY.
    """
    token = None
    if x_admin_key:
        token = x_admin_key.strip()
    elif authorization:
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
        elif len(parts) == 1:
            token = parts[0]

    if not token or token != ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Privileged access required. Missing or invalid administrator key in X-Admin-Key or Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return True
