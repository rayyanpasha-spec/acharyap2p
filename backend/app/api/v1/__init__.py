from fastapi import APIRouter

from app.api.v1 import (admin, ai, analytics, auth, certificates, city_twin, complaints, games, garbage, images,
                        locations, meta, notifications, officer, voice)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(auth.users_router)
api_router.include_router(meta.router)
api_router.include_router(locations.router)
api_router.include_router(voice.router)
api_router.include_router(ai.router)
api_router.include_router(complaints.router)
api_router.include_router(images.router)
api_router.include_router(notifications.router)
api_router.include_router(officer.router)
api_router.include_router(admin.router)
api_router.include_router(analytics.router)
api_router.include_router(garbage.router)
api_router.include_router(garbage.demo_router)
api_router.include_router(certificates.router)
api_router.include_router(games.router)
api_router.include_router(city_twin.router)

# mounted at root: /ws/v1/garbage/live and /ws/v1/city-twin/live
ws_router = APIRouter()
ws_router.include_router(garbage.ws_router)
ws_router.include_router(city_twin.ws_router)
