"""Central configuration. Every value is overridable by environment variable / backend/.env.

Dual database design (see docs/ARCHITECTURE.md):
  * Complaint/operations data  -> SQLAlchemy.  DATABASE_URL=sqlite:///./civiclens.db (local)
                                  or the Render PostgreSQL URL (hosted).
  * User accounts / logins      -> MongoDB when MONGODB_URI is set, otherwise the SQL `users` table
                                  (so the app still runs locally without a mongod process).
"""
from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_ENV: str = "development"
    APP_NAME: str = "CivicLens"
    API_V1_PREFIX: str = "/api/v1"
    # Comma separated list of allowed browser origins (Vercel URL in production)
    FRONTEND_ORIGIN: str = "http://localhost:5173,http://localhost:5199"
    FRONTEND_ORIGIN_REGEX: str = ""  # e.g. https://.*\.vercel\.app for Vercel preview deployments

    # --- Bengaluru pilot defaults (README section 1) ---
    DEFAULT_CITY: str = "Bengaluru"
    DEFAULT_STATE: str = "Karnataka"
    DEFAULT_COUNTRY: str = "India"
    DEFAULT_COUNTRY_CODE: str = "IN"
    DEFAULT_MAP_LATITUDE: float = 12.9716
    DEFAULT_MAP_LONGITUDE: float = 77.5946
    DEFAULT_MAP_ZOOM: int = 12
    SERVICE_AREA_MODE: str = "greater_bengaluru"
    # Folder with GeoJSON files of the OFFICIAL imported boundaries (see docs/BOUNDARIES.md).
    BOUNDARY_DATA_DIR: str = "./data/boundaries"
    # Used ONLY when no official boundary file is imported. Coarse approximate check, clearly flagged.
    FALLBACK_SERVICE_AREA_RADIUS_KM: float = 35.0

    # --- Databases ---
    DATABASE_URL: str = "sqlite:///./civiclens.db"
    MONGODB_URI: str = ""            # empty -> users stored in SQL table `users`
    MONGODB_DB_NAME: str = "civiclens"

    # --- Auth ---
    JWT_SECRET_KEY: str = "dev-only-change-me-please-use-a-long-random-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_MINUTES: int = 60
    JWT_REFRESH_TOKEN_DAYS: int = 7

    # --- AI: OpenAI primary, Ollama backup, deterministic rules as last resort ---
    AI_PROVIDER_ORDER: str = "openai,ollama,rules"
    OPENAI_API_KEY: str = ""
    OPENAI_TRIAGE_MODEL: str = "gpt-4.1-mini"
    OPENAI_TRANSCRIPTION_MODEL: str = "gpt-4o-mini-transcribe"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:3b"
    OLLAMA_VISION_MODEL: str = ""     # e.g. a llava/vision model if installed; empty -> no photo analysis via Ollama
    AI_TIMEOUT_SECONDS: float = 25.0

    # --- Uploads ---
    UPLOAD_DIR: str = "./uploads"
    MAX_IMAGE_SIZE_MB: int = 10
    MAX_AUDIO_SIZE_MB: int = 20
    MAX_AUDIO_DURATION_SECONDS: int = 90
    MAX_IMAGES_PER_REPORT: int = 4

    # --- Duplicate detection (configurable, README section 4) ---
    SAME_USER_DUPLICATE_RADIUS_METRES: int = 150
    COMMUNITY_DUPLICATE_RADIUS_METRES: int = 100
    DUPLICATE_LOOKBACK_DAYS: int = 180

    # --- Geocoding (OpenStreetMap Nominatim; set to "none" to disable external lookups) ---
    GEOCODER_PROVIDER: str = "nominatim"
    GEOCODER_BASE_URL: str = "https://nominatim.openstreetmap.org"
    GEOCODER_USER_AGENT: str = "CivicLens-prototype/1.0"

    # --- CleanRoute simulation ---
    GARBAGE_TRACKER_MODE: str = "simulation"
    GARBAGE_SIMULATION_INTERVAL_SECONDS: float = 3.0
    GARBAGE_SIMULATION_AUTOSTART: bool = True

    CERTIFICATE_STORAGE_DIR: str = "./generated_certificates"
    PUBLIC_BASE_URL: str = "http://localhost:5173"  # frontend URL, used inside certificate QR codes

    # --- Seeding ---
    SEED_REFERENCE_DATA: bool = True   # departments, agencies, categories, routing rules, SLA, games
    SEED_DEMO_DATA: bool = True        # fictional demo users/complaints/vehicles (labelled "Demo data")
    DEMO_PASSWORD: str = "Demo@12345"  # password of seeded DEMO accounts only

    @field_validator("DATABASE_URL")
    @classmethod
    def _normalise_db_url(cls, v: str) -> str:
        # Render supplies postgres:// or postgresql://. SQLAlchemy needs an explicit driver.
        if v.startswith("postgres://"):
            v = "postgresql+psycopg2://" + v[len("postgres://"):]
        elif v.startswith("postgresql://"):
            v = "postgresql+psycopg2://" + v[len("postgresql://"):]
        return v

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip().rstrip("/") for o in self.FRONTEND_ORIGIN.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
