# CivicLens API image (local/optional - Render builds from requirements.txt directly, see ../render.yaml).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Run as a non-root user.
RUN useradd --create-home --uid 10001 appuser

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . .

# Writable folders for uploaded photos and generated certificates (mount volumes here to keep them).
RUN mkdir -p /app/uploads /app/generated_certificates && chown -R appuser:appuser /app
USER appuser

ENV PORT=8000
EXPOSE 8000

# Apply migrations, then start the API. Uses $PORT so the same image works on platforms that inject it.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
