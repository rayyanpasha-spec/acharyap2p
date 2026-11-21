"""Voice reporting: POST /voice/transcribe, PATCH /voice/transcripts/{id}.
Audio is read into memory, sent for transcription and dropped in `finally`; it is never written to disk or logged and
transcript text is never logged. Only the transcript row is stored (the citizen reviews/edits it before submitting)."""
import os
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.core.deps import CurrentUser, get_current_user
from app.core.rate_limit import rate_limit
from app.database import get_db
from app.models import VoiceTranscript
from app.services import transcription_service
from app.services.transcription_service import (NO_KEY_MESSAGE, SUPPORTED_HINTS, TranscriptionError,
                                                TranscriptionUnavailable)

router = APIRouter(prefix="/voice", tags=["voice"])

ALLOWED_EXTENSIONS = {"webm", "ogg", "wav", "mp3", "m4a", "mp4", "mpeg"}
# MIME (without parameters such as ;codecs=opus) -> extension used for the provider
MIME_TO_EXT = {
    "audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg", "application/ogg": "ogg", "audio/opus": "ogg",
    "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/vnd.wave": "wav",
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a",
    "audio/aac": "m4a", "video/mp4": "mp4",
}
GENERIC_MIMES = {"", "application/octet-stream", "binary/octet-stream"}


class ConfirmBody(BaseModel):
    confirmed_transcript: str = Field(min_length=1, max_length=4000)


def _pick_extension(filename: Optional[str], content_type: Optional[str]) -> str:
    mime = (content_type or "").split(";")[0].strip().lower()
    ext = os.path.splitext(filename or "")[1].lstrip(".").lower()
    if mime not in GENERIC_MIMES and mime not in MIME_TO_EXT:
        raise HTTPException(415, "Unsupported audio type. Please record again or type your complaint.")
    if ext in ALLOWED_EXTENSIONS:
        return ext
    if mime in MIME_TO_EXT:
        return MIME_TO_EXT[mime]
    raise HTTPException(415, "Unsupported audio file type. Allowed: webm, ogg, wav, mp3, m4a, mp4, mpeg.")


@router.post("/transcribe", dependencies=[Depends(rate_limit("voice", 20, 3600))])
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(None),
    duration_seconds: Optional[float] = Form(None),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    data: Optional[bytes] = None
    try:
        ext = _pick_extension(audio.filename, audio.content_type)
        limit = settings.MAX_AUDIO_SIZE_MB * 1024 * 1024
        data = await audio.read(limit + 1)
        if len(data) > limit:
            raise HTTPException(413, f"Audio is larger than {settings.MAX_AUDIO_SIZE_MB} MB. Please record a shorter message.")
        if not data:
            raise HTTPException(400, "The audio file is empty.")
        if duration_seconds is not None:
            if duration_seconds < 0:
                raise HTTPException(400, "Invalid duration.")
            if duration_seconds > settings.MAX_AUDIO_DURATION_SECONDS:
                raise HTTPException(400, f"Recording is longer than {settings.MAX_AUDIO_DURATION_SECONDS} seconds. "
                                         "Please record a shorter message.")
        hint = language if language in SUPPORTED_HINTS else None

        if not settings.OPENAI_API_KEY:
            raise HTTPException(503, NO_KEY_MESSAGE)
        try:
            result = await transcription_service.transcribe(data, ext, hint)
        except TranscriptionUnavailable:
            raise HTTPException(503, NO_KEY_MESSAGE)
        except TranscriptionError:
            raise HTTPException(502, "We could not transcribe that recording. Please try again or type your complaint.")
    finally:
        data = None  # drop the audio immediately; nothing was written to disk
        try:
            await audio.close()
        except Exception:
            pass

    text = (result.get("text") or "").strip()
    if not text:
        raise HTTPException(422, "We could not hear any speech in that recording. Please try again or type your complaint.")
    row = VoiceTranscript(
        user_id=user.id, selected_language=hint, detected_language=result.get("detected_language"),
        original_transcript=text, model=result.get("model"),
        duration_seconds=result.get("duration_seconds") if result.get("duration_seconds") is not None else duration_seconds,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "transcript_id": row.id, "text": text, "detected_language": row.detected_language,
        "language_used": hint or "auto", "model": row.model,
    }


@router.patch("/transcripts/{transcript_id}")
def confirm_transcript(transcript_id: int, body: ConfirmBody, db: Session = Depends(get_db),
                       user: CurrentUser = Depends(get_current_user)):
    row = db.get(VoiceTranscript, transcript_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(404, "Transcript not found")
    text = body.confirmed_transcript.strip()
    if not text:
        raise HTTPException(422, "Transcript cannot be empty")
    row.confirmed_transcript = text
    db.commit()
    return {"transcript_id": row.id, "confirmed_transcript": row.confirmed_transcript}
