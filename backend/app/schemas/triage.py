"""Pydantic models shared between the AI triage service (owner: AI agent) and complaint intake (owner: intake agent)."""
from typing import List, Optional

from pydantic import BaseModel, Field


class TriageResult(BaseModel):
    """Validated structured AI result (README section 5). Out-of-taxonomy values must be rejected / normalised
    by the triage service before this object is returned."""

    language: str = "en"                     # detected or selected: en|hi|kn|ta|te|ml
    category: str = "other"                  # code from `categories` table
    subcategory: Optional[str] = None        # code from that category's subcategories, or None
    summary: str = ""                        # <= 200 chars, neutral, in English
    translated_description: Optional[str] = None  # English translation when language != en
    severity: str = "medium"                 # low|medium|high|critical  (final, after deterministic rules)
    severity_score: float = 40.0             # 0-100
    reason: str = ""                         # ONE line, <= 160 chars, shown to citizen + officer
    department_code: Optional[str] = None
    agency_kind: Optional[str] = None        # corporation|bwssb|bescom
    routing_note: Optional[str] = None
    confidence: float = 0.5                  # 0-1
    image_observations: List[str] = Field(default_factory=list)
    requires_human_review: bool = False
    review_reasons: List[str] = Field(default_factory=list)
    provider: str = "rules"                  # openai | ollama | rules  (which engine produced the classification)
    model: Optional[str] = None
    photo_analysis: str = "not_provided"     # not_provided | analysed | unavailable
    notes: List[str] = Field(default_factory=list)  # e.g. "OpenAI unavailable, used Ollama backup"
