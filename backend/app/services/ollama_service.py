"""Ollama backup provider: POST {OLLAMA_BASE_URL}/api/chat with format=json, stream=false. Photos are analysed only
when OLLAMA_VISION_MODEL is configured; otherwise they are ignored and the caller records photo_analysis=unavailable."""
import json
from typing import Dict, Optional, Sequence, Tuple

import httpx

from app.config import settings
from app.services import image_analysis_service as imgs
from app.services.classification_service import (ModelTriage, ProviderError, build_system_prompt,
                                                  build_user_prompt, parse_model_json)


def vision_enabled() -> bool:
    return bool(settings.OLLAMA_VISION_MODEL.strip())


def is_reachable(timeout: float = 2.0) -> bool:
    try:
        r = httpx.get(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags", timeout=timeout)
        return r.status_code == 200
    except Exception:
        return False


def triage(text: str, language: str, images: Optional[Sequence[Tuple[bytes, str]]],
           taxonomy_names: Dict[str, Dict], locality: Optional[str] = None,
           category_hint: Optional[str] = None) -> Tuple[ModelTriage, str, str]:
    """Return (validated output, model name, photo_analysis: not_provided|analysed|unavailable)."""
    photos = imgs.usable_images(images)
    use_vision = bool(photos) and vision_enabled()
    model = settings.OLLAMA_VISION_MODEL.strip() if use_vision else settings.OLLAMA_MODEL
    user_msg: Dict = {"role": "user", "content": build_user_prompt(text, language, locality, category_hint)}
    if use_vision:
        user_msg["images"] = [imgs.to_base64(raw) for raw, _ in photos]
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": build_system_prompt(taxonomy_names)}, user_msg],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0},
    }
    try:
        r = httpx.post(f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat", json=payload,
                       timeout=settings.AI_TIMEOUT_SECONDS)
        r.raise_for_status()
        raw = (r.json().get("message") or {}).get("content", "")
    except (httpx.HTTPError, json.JSONDecodeError, ValueError, AttributeError) as exc:
        raise ProviderError(f"Ollama request failed ({type(exc).__name__})") from None
    try:
        mt = parse_model_json(raw)
    except Exception as exc:
        raise ProviderError(f"Ollama output failed validation ({type(exc).__name__})") from None
    if use_vision:
        photo = "analysed"
    else:
        photo = "unavailable" if photos else "not_provided"
    return mt, model, photo
