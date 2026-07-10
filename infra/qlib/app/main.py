from __future__ import annotations

from contextlib import asynccontextmanager

from typing import Dict

from fastapi import FastAPI

from app.api.data import router as data_router
from app.api.logs import router as logs_router
from app.config import get_settings
from app.logging.stream_hub import get_log_hub, get_service_logger

logger = get_service_logger("qlib_service.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.ensure_dirs()
    hub = get_log_hub()
    import asyncio

    loop = asyncio.get_running_loop()
    hub.start(loop)
    logger.info("Qlib Data Service 已启动 data_dir=%s", settings.qlib_data_dir)
    yield
    hub.stop()
    logger.info("Qlib Data Service 已停止")


app = FastAPI(
    title="Qlib Data Service",
    description="基于 qlib 的量化数据服务，提供 SSE 日志流与 Tushare 数据同步",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(logs_router)
app.include_router(data_router)


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}
