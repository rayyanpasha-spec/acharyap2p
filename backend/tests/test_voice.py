"""Voice endpoint tests. The OpenAI transcription call is always faked; nothing touches the network."""
import asyncio
from types import SimpleNamespace

import pytest

from app.config import settings
from app.models import VoiceTranscript
from app.services import transcription_service
from app.services.transcription_service import NO_KEY_MESSAGE, TranscriptionError

URL = "/api/v1/voice/transcribe"


def run(coro):
    return asyncio.run(coro)

AUDIO = b"RIFF$\x00\x00\x00WAVEfmt " + b"\x00" * 40


def _files(name="rec.webm", ctype="audio/webm", data=AUDIO):
    return {"audio": (name, data, ctype)}


@pytest.fixture(autouse=True)
def _app_started(client):
    yield


def test_requires_auth(client):
    assert client.post(URL, files=_files()).status_code == 401
    assert client.patch("/api/v1/voice/transcripts/1", json={"confirmed_transcript": "x"}).status_code == 401


def test_validation_errors(client, make_user, monkeypatch):
    _u, h = make_user("citizen")
    assert client.post(URL, headers=h).status_code == 422                                     # no file
    r = client.post(URL, headers=h, files=_files("notes.txt", "text/plain", b"hello"))
    assert r.status_code == 415                                                              # not audio
    r = client.post(URL, headers=h, files=_files("clip.exe", "application/octet-stream", AUDIO))
    assert r.status_code == 415                                                              # extension not allowed
    assert client.post(URL, headers=h, files=_files(data=b"")).status_code == 400            # empty
    r = client.post(URL, headers=h, files=_files(), data={"duration_seconds": str(settings.MAX_AUDIO_DURATION_SECONDS + 1)})
    assert r.status_code == 400 and "longer" in r.json()["detail"]
    monkeypatch.setattr(settings, "MAX_AUDIO_SIZE_MB", 0)
    assert client.post(URL, headers=h, files=_files()).status_code == 413                    # too large


def test_503_without_openai_key(client, make_user, monkeypatch):
    _u, h = make_user("citizen")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    r = client.post(URL, headers=h, files=_files(), data={"language": "kn"})
    assert r.status_code == 503
    assert r.json()["detail"] == NO_KEY_MESSAGE
    assert "OpenAI API key" in r.json()["detail"]


def test_success_stores_transcript_and_passes_language_hint(client, make_user, db, monkeypatch):
    user, h = make_user("citizen")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test-not-real")
    seen = []

    async def fake_transcribe(audio_bytes, filename_ext, language_hint=None):
        seen.append((len(audio_bytes), filename_ext, language_hint))
        return {"text": "ರಸ್ತೆಯಲ್ಲಿ ಗುಂಡಿ ಇದೆ", "detected_language": "kn", "model": "fake-transcribe", "duration_seconds": 4.2}

    monkeypatch.setattr(transcription_service, "transcribe", fake_transcribe)
    r = client.post(URL, headers=h, files=_files("voice.webm", "audio/webm;codecs=opus"), data={"language": "kn", "duration_seconds": "12"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"transcript_id", "text", "detected_language", "language_used", "model"}
    assert body["text"] == "ರಸ್ತೆಯಲ್ಲಿ ಗುಂಡಿ ಇದೆ" and body["detected_language"] == "kn"
    assert body["language_used"] == "kn" and body["model"] == "fake-transcribe"
    assert seen == [(len(AUDIO), "webm", "kn")]
    row = db.get(VoiceTranscript, body["transcript_id"])
    assert row.user_id == user["id"] and row.original_transcript == body["text"] and row.confirmed_transcript is None
    assert row.model == "fake-transcribe" and row.selected_language == "kn"

    # invalid language hint is dropped; auto-detect is reported
    r = client.post(URL, headers=h, files=_files("voice.ogg", "audio/ogg"), data={"language": "xx"})
    assert r.status_code == 200 and r.json()["language_used"] == "auto"
    assert seen[-1][2] is None and seen[-1][1] == "ogg"


def test_provider_failure_and_silence(client, make_user, monkeypatch):
    _u, h = make_user("citizen")
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "sk-test-not-real")

    async def failing(*a, **k):
        raise TranscriptionError("boom")

    monkeypatch.setattr(transcription_service, "transcribe", failing)
    assert client.post(URL, headers=h, files=_files()).status_code == 502

    async def silent(*a, **k):
        return {"text": "  ", "detected_language": None, "model": "m", "duration_seconds": None}

    monkeypatch.setattr(transcription_service, "transcribe", silent)
    assert client.post(URL, headers=h, files=_files()).status_code == 422


def test_confirm_transcript_owner_only(client, make_user, db, monkeypatch):
    _u, h = make_user("citizen")
    _o, other = make_user("citizen")
    row = VoiceTranscript(user_id=_u["id"], original_transcript="original words", model="m")
    db.add(row)
    db.commit()
    url = f"/api/v1/voice/transcripts/{row.id}"
    assert client.patch(url, headers=other, json={"confirmed_transcript": "hijack"}).status_code == 404
    assert client.patch(url, headers=h, json={"confirmed_transcript": ""}).status_code == 422
    r = client.patch(url, headers=h, json={"confirmed_transcript": "  corrected words  "})
    assert r.status_code == 200 and r.json() == {"transcript_id": row.id, "confirmed_transcript": "corrected words"}
    db.expire_all()
    fresh = db.get(VoiceTranscript, row.id)
    assert fresh.confirmed_transcript == "corrected words" and fresh.original_transcript == "original words"
    assert client.patch("/api/v1/voice/transcripts/999999", headers=h, json={"confirmed_transcript": "x"}).status_code == 404


# ---------------------------------------------------------------- the service itself, with a fake OpenAI client
def test_transcribe_service_calls_audio_api(monkeypatch):
    calls = []

    class FakeTranscriptions:
        def create(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(text=" hello ", language="kannada", duration=3.5)

    fake = SimpleNamespace(audio=SimpleNamespace(transcriptions=FakeTranscriptions()))
    monkeypatch.setattr(transcription_service, "get_client", lambda: fake)
    out = run(transcription_service.transcribe(b"abc", ".webm", "kn"))
    assert out == {"text": "hello", "detected_language": "kn", "model": settings.OPENAI_TRANSCRIPTION_MODEL,
                   "duration_seconds": 3.5}
    assert calls[0]["model"] == settings.OPENAI_TRANSCRIPTION_MODEL
    assert calls[0]["file"] == ("audio.webm", b"abc") and calls[0]["language"] == "kn"
    run(transcription_service.transcribe(b"abc", "wav", "xx"))
    assert "language" not in calls[1] and calls[1]["file"][0] == "audio.wav"
    run(transcription_service.transcribe(b"abc", "wav", None))
    assert "language" not in calls[2]


def test_transcribe_service_errors(monkeypatch):
    class Boom:
        def create(self, **kwargs):
            raise RuntimeError("network")

    monkeypatch.setattr(transcription_service, "get_client",
                        lambda: SimpleNamespace(audio=SimpleNamespace(transcriptions=Boom())))
    with pytest.raises(TranscriptionError):
        run(transcription_service.transcribe(b"abc", "webm"))
    monkeypatch.undo()
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    with pytest.raises(transcription_service.TranscriptionUnavailable):
        run(transcription_service.transcribe(b"abc", "webm"))
