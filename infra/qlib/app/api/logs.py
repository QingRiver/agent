from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.logging.stream_hub import LOG_LEVELS, get_log_hub

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("/stream")
async def stream_logs(
    level: str = Query(default="INFO", description="Minimum log level"),
) -> StreamingResponse:
    min_level = LOG_LEVELS.get(level.upper(), logging.INFO)
    hub = get_log_hub()

    async def event_generator() -> AsyncIterator[str]:
        async for event in hub.stream_events(min_level=min_level):
            yield f"data: {event.to_json()}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
