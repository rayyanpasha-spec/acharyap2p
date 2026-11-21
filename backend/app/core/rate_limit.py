"""Tiny in-memory sliding-window rate limiter (per process). Good enough for a single Render instance.
Usage:  `dependencies=[Depends(rate_limit("login", 10, 60))]`  -> 10 requests / 60 s per client IP."""
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, Request

from app.config import settings

_hits: Dict[str, Deque[float]] = defaultdict(deque)


def rate_limit(bucket: str, limit: int, window_seconds: int):
    def dep(request: Request):
        if settings.APP_ENV == "test":
            return
        ip = request.client.host if request.client else "unknown"
        key = f"{bucket}:{ip}"
        now = time.monotonic()
        q = _hits[key]
        while q and now - q[0] > window_seconds:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(429, "Too many requests. Please slow down and try again shortly.")
        q.append(now)

    return dep
