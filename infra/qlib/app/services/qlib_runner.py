from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

from app.config import get_settings
from app.logging.stream_hub import get_service_logger
from app.services.sync_runner import run_sync
from app.services.sync_state import SyncCheckpoint, load_checkpoint

logger = get_service_logger("qlib_service.runner")

_executor = ThreadPoolExecutor(max_workers=1)
_sync_lock = asyncio.Lock()
_running = False
_last_checkpoint: Optional[SyncCheckpoint] = None


class SyncSlotBusyError(Exception):
    """同步槽位已被占用。"""


def is_sync_running() -> bool:
    return _running


def get_last_checkpoint() -> Optional[SyncCheckpoint]:
    settings = get_settings()
    return load_checkpoint(settings.checkpoint_path) or _last_checkpoint


async def reserve_sync_slot() -> None:
    """原子占用同步槽位；若已有任务在跑则抛出 SyncSlotBusyError。"""
    global _running

    async with _sync_lock:
        if _running:
            raise SyncSlotBusyError("同步任务已在运行中")
        _running = True


async def release_sync_slot() -> None:
    global _running

    async with _sync_lock:
        _running = False


async def run_sync_task(
    *,
    mode: str = "backfill",
    trade_date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    resume: bool = True,
    force: bool = False,
    limit: Optional[int] = None,
    symbols: Optional[List[str]] = None,
) -> None:
    global _last_checkpoint

    loop = asyncio.get_running_loop()

    def _run() -> SyncCheckpoint:
        return run_sync(
            mode=mode,
            trade_date=trade_date,
            start_date=start_date,
            end_date=end_date,
            resume=resume,
            force=force,
            limit=limit,
            symbols=symbols,
            install_signal_handlers=False,
        )

    try:
        logger.info("后台同步任务启动 mode=%s", mode)
        checkpoint = await loop.run_in_executor(_executor, _run)
        _last_checkpoint = checkpoint
        logger.info("后台同步任务结束 mode=%s phase=%s", checkpoint.mode, checkpoint.phase)
    except Exception:
        logger.exception("后台同步任务异常")
        raise


async def run_reconcile_task(*, write_manifest: bool = False) -> None:
    global _last_checkpoint

    loop = asyncio.get_running_loop()

    def _run() -> SyncCheckpoint:
        return run_sync(reconcile_only=True, write_manifest=write_manifest, install_signal_handlers=False)

    try:
        logger.info("后台 reconcile 任务启动")
        checkpoint = await loop.run_in_executor(_executor, _run)
        _last_checkpoint = checkpoint
        logger.info("后台 reconcile 任务结束")
    except Exception:
        logger.exception("后台 reconcile 任务异常")
        raise


async def start_sync_task(
    *,
    mode: str = "backfill",
    trade_date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    resume: bool = True,
    force: bool = False,
    limit: Optional[int] = None,
    symbols: Optional[List[str]] = None,
) -> None:
    await reserve_sync_slot()
    try:
        await run_sync_task(
            mode=mode,
            trade_date=trade_date,
            start_date=start_date,
            end_date=end_date,
            resume=resume,
            force=force,
            limit=limit,
            symbols=symbols,
        )
    finally:
        await release_sync_slot()


async def start_reconcile_task(*, write_manifest: bool = False) -> None:
    await reserve_sync_slot()
    try:
        await run_reconcile_task(write_manifest=write_manifest)
    finally:
        await release_sync_slot()
