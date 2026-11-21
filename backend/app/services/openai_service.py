"""OpenAI triage provider: Responses API via the `openai` SDK, JSON-only output validated with Pydantic, photos as
base64 data URLs. Falls back to chat.completions (json_object) only when the Responses API shape is unavailable in the
installed SDK / endpoint. The API key never leaves the backend. Nothing here logs complaint text or photos."""
from typing import Dict, List, Optional, Sequence, Tuple

from app.config import settings
from app.services import image_analysis_service as imgs
from app.services.classification_service import (ModelTriage, ProviderError, build_system_prompt,
                                                  build_user_prompt, parse_model_json)


def is_configured() -> bool:
    return bool(settings.OPENAI_API_KEY)


def get_client():
    """Factory kept separate so tests can monkeypatch it with a fake client."""
    if not is_configured():
        raise ProviderError("OpenAI API key is not configured")
    from openai import OpenAI

    return OpenAI(api_key=settings.OPENAI_API_KEY, timeout=settings.AI_TIMEOUT_SECONDS, max_retries=0)


def _responses_call(client, system: str, user_text: str, photos: List[Tuple[bytes, str]]) -> str:
    content: List[dict] = [{"type": "input_text", "text": user_text}]
    for raw, ctype in photos:
        content.append({"type": "input_image", "image_url": imgs.to_data_url(raw, ctype)})
    resp = client.responses.create(
        model=settings.OPENAI_TRIAGE_MODEL,
        instructions=system,
        input=[{"role": "user", "content": content}],
        text={"format": {"type": "json_object"}},
        max_output_tokens=900,
        store=False,
        timeout=settings.AI_TIMEOUT_SECONDS,
    )
    out = getattr(resp, "output_text", None)
    if not isinstance(out, str) or not out.strip():
        raise ProviderError("OpenAI returned no text output")
    return out


def _chat_call(client, system: str, user_text: str, photos: List[Tuple[bytes, str]]) -> str:
    content: List[dict] = [{"type": "text", "text": user_text}]
    for raw, ctype in photos:
        content.append({"type": "image_url", "image_url": {"url": imgs.to_data_url(raw, ctype)}})
    resp = client.chat.completions.create(
        model=settings.OPENAI_TRIAGE_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": content}],
        response_format={"type": "json_object"},
        max_tokens=900,
        timeout=settings.AI_TIMEOUT_SECONDS,
    )
    return resp.choices[0].message.content or ""


def triage(text: str, language: str, images: Optional[Sequence[Tuple[bytes, str]]],
           taxonomy_names: Dict[str, Dict], locality: Optional[str] = None,
           category_hint: Optional[str] = None) -> Tuple[ModelTriage, str, str]:
    """Return (validated output, model name, photo_analysis) where photo_analysis is not_provided|analysed.
    Raises ProviderError (or an SDK exception) on any failure; the caller falls back to the next provider."""
    client = get_client()
    system = build_system_prompt(taxonomy_names)
    user_text = build_user_prompt(text, language, locality, category_hint)
    photos = imgs.usable_images(images)
    try:
        raw = _responses_call(client, system, user_text, photos)
    except (AttributeError, TypeError):  # Responses API shape not available in this SDK/endpoint
        raw = _chat_call(client, system, user_text, photos)
    try:
        mt = parse_model_json(raw)
    except Exception as exc:  # malformed JSON / schema violation
        raise ProviderError(f"OpenAI output failed validation ({type(exc).__name__})") from None
    return mt, settings.OPENAI_TRIAGE_MODEL, ("analysed" if photos else "not_provided")
