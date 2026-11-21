"""GET /ai/status (staff) and POST /ai/preview-triage (office roles). Never returns secrets (only whether a key exists)."""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import CurrentUser, require_office, require_staff
from app.database import get_db
from app.services import ollama_service, openai_service, triage_service

router = APIRouter(prefix="/ai", tags=["ai"])


class PreviewBody(BaseModel):
    text: str = Field(min_length=3, max_length=4000)
    language: Optional[str] = None


@router.get("/status")
def ai_status(user: CurrentUser = Depends(require_staff)):
    order = triage_service._provider_order()
    ollama_reachable = ollama_service.is_reachable(2.0) if "ollama" in order else None
    return {
        "providers": [
            {"name": "openai", "configured": openai_service.is_configured(), "reachable": None,
             "model": settings.OPENAI_TRIAGE_MODEL},
            {"name": "ollama", "configured": bool(settings.OLLAMA_BASE_URL), "reachable": ollama_reachable,
             "model": settings.OLLAMA_MODEL},
            {"name": "rules", "configured": True, "reachable": True, "model": "keyword-rules-v1"},
        ],
        "order": order,
        "vision": {"openai": openai_service.is_configured(), "ollama": ollama_service.vision_enabled()},
    }


@router.post("/preview-triage")
def preview_triage(body: PreviewBody, db: Session = Depends(get_db), user: CurrentUser = Depends(require_office)):
    result = triage_service.run_triage(db, text=body.text, language=body.language or "en")
    return result.model_dump()
