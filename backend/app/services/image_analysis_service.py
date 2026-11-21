"""Photo plumbing for the AI providers. Photos are only ever held in memory here: encoded for the request and
dropped. Nothing is stored or logged. (Intake already re-encodes uploads and strips EXIF before they reach triage.)"""
import base64
from typing import List, Optional, Sequence, Tuple

from app.config import settings

_MAX_BYTES_FOR_MODEL = 8 * 1024 * 1024


def sniff_content_type(raw: bytes, declared: Optional[str] = None) -> Optional[str]:
    """Return image/jpeg|png|webp based on magic bytes (the declared type is not trusted), else None."""
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return None


def usable_images(images: Optional[Sequence[Tuple[bytes, str]]]) -> List[Tuple[bytes, str]]:
    """Filter to at most MAX_IMAGES_PER_REPORT valid photos of a reasonable size."""
    out: List[Tuple[bytes, str]] = []
    for item in images or []:
        try:
            raw, ctype = item
        except (TypeError, ValueError):
            continue
        if not isinstance(raw, (bytes, bytearray)) or not raw or len(raw) > _MAX_BYTES_FOR_MODEL:
            continue
        real = sniff_content_type(bytes(raw), ctype)
        if real:
            out.append((bytes(raw), real))
        if len(out) >= settings.MAX_IMAGES_PER_REPORT:
            break
    return out


def to_base64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def to_data_url(raw: bytes, content_type: str) -> str:
    return f"data:{content_type};base64,{to_base64(raw)}"
