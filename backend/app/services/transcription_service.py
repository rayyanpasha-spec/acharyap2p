"""Speech-to-text via the OpenAI audio transcription API. Audio is handled as in-memory bytes only (the caller drops
it right after this returns). Neither audio nor transcript text is ever logged."""
from typing import Optional

from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.core.constants import LANGUAGE_NAMES_EN

SUPPORTED_HINTS = ("en", "hi", "kn", "ta", "te", "ml")
NO_KEY_MESSAGE = "Voice transcription needs an OpenAI API key on the server. Please type your complaint instead."
_NAME_TO_CODE = {name.lower(): code for code, name in LANGUAGE_NAMES_EN.items()}


class TranscriptionUnavailable(Exception):
    """No OPENAI_API_KEY configured."""


class TranscriptionError(Exception):
    """The provider call failed (network, quota, unsupported audio ...)."""


def get_client():
    """Factory kept separate so tests can monkeypatch a fake client."""
    if not settings.OPENAI_API_KEY:
        raise TranscriptionUnavailable(NO_KEY_MESSAGE)
    from openai import OpenAI

    return OpenAI(api_key=settings.OPENAI_API_KEY, timeout=max(settings.AI_TIMEOUT_SECONDS, 60.0), max_retries=0)


def _detected_code(value) -> Optional[str]:
    if not isinstance(value, str) or not value.strip():
        return None
    v = value.strip().lower()
    return v if v in SUPPORTED_HINTS else _NAME_TO_CODE.get(v, v[:10])


def _transcribe_sync(audio_bytes: bytes, filename_ext: str, language_hint: Optional[str]) -> dict:
    client = get_client()
    ext = (filename_ext or "webm").lstrip(".").lower() or "webm"
    kwargs = {"model": settings.OPENAI_TRANSCRIPTION_MODEL, "file": (f"audio.{ext}", audio_bytes)}
    if language_hint in SUPPORTED_HINTS:
        kwargs["language"] = language_hint
    try:
        resp = client.audio.transcriptions.create(**kwargs)
    except TranscriptionUnavailable:
        raise
    except Exception as exc:
        raise TranscriptionError(f"Transcription request failed ({type(exc).__name__})") from None
    text = getattr(resp, "text", None)
    if text is None and isinstance(resp, dict):
        text = resp.get("text")
    duration = getattr(resp, "duration", None)
    language = getattr(resp, "language", None)
    return {
        "text": (text or "").strip(),
        "detected_language": _detected_code(language),
        "model": settings.OPENAI_TRANSCRIPTION_MODEL,
        "duration_seconds": float(duration) if isinstance(duration, (int, float)) else None,
    }


async def transcribe(audio_bytes: bytes, filename_ext: str, language_hint: Optional[str] = None) -> dict:
    """Return {text, detected_language, model, duration_seconds|None}. Raises TranscriptionUnavailable when no key is
    configured and TranscriptionError for provider failures."""
    return await run_in_threadpool(_transcribe_sync, audio_bytes, filename_ext, language_hint)
