from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services.qlib_runner import (
    SyncSlotBusyError,
    get_last_checkpoint,
    is_sync_running,
    release_sync_slot,
    reserve_sync_slot,
    run_reconcile_task,
    run_sync_task,
)
from app.services.source_bundle import (
    conservative_watermark,
    load_data_manifest,
    prepare_bundle_for_reconcile,
    validate_bundle,
)
from app.services.sync_meta import load_sync_meta
from app.services.sync_state import load_checkpoint

router = APIRouter(prefix="/api/data", tags=["data"])


class SyncRequest(BaseModel):
    mode: str = Field(default="backfill", description="backfill | incremental")
    trade_date: Optional[str] = Field(default=None, description="增量模式目标交易日 YYYYMMDD（补洞至该日）")
    start_date: Optional[str] = Field(default=None, description="回填起始 YYYYMMDD")
    end_date: Optional[str] = Field(default=None, description="回填结束 YYYYMMDD")
    resume: bool = True
    force: bool = False
    limit: Optional[int] = Field(default=None, description="调试用，限制股票数量")
    symbols: Optional[List[str]] = Field(default=None, description="仅回填指定股票代码")


class BundleInfo(BaseModel):
    symbol_count: int = 0
    global_min_date: Optional[str] = None
    global_max_date: Optional[str] = None
    packaged_at: Optional[str] = None
    conservative_watermark: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


class SyncStatusResponse(BaseModel):
    running: bool
    mode: Optional[str] = None
    phase: Optional[str] = None
    trade_date: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    symbols_total: int = 0
    completed_count: int = 0
    failed_count: int = 0
    progress_pct: float = 0.0
    last_success_trade_date: Optional[str] = None
    updated_at: Optional[str] = None
    bundle: Optional[BundleInfo] = None


class ReconcileRequest(BaseModel):
    write_manifest: bool = False


def _build_bundle_info(settings) -> BundleInfo:
    manifest = load_data_manifest(settings.data_manifest_path)
    meta = load_sync_meta(settings.sync_meta_path)
    warnings = validate_bundle(settings)
    symbol_count = int(manifest.get("symbol_count", 0))
    if symbol_count == 0 and settings.bars_dir.exists():
        symbol_count = len(list(settings.bars_dir.glob("*.csv")))
    return BundleInfo(
        symbol_count=symbol_count,
        global_min_date=manifest.get("global_min_date") or None,
        global_max_date=manifest.get("global_max_date") or None,
        packaged_at=manifest.get("packaged_at") or None,
        conservative_watermark=conservative_watermark(meta) or None,
        warnings=warnings,
    )


def _checkpoint_to_status(checkpoint, settings) -> SyncStatusResponse:
    meta = load_sync_meta(settings.sync_meta_path)
    return SyncStatusResponse(
        running=is_sync_running(),
        mode=checkpoint.mode,
        phase=checkpoint.phase,
        trade_date=checkpoint.trade_date or None,
        start_date=checkpoint.start_date or None,
        end_date=checkpoint.end_date or None,
        symbols_total=checkpoint.symbols_total,
        completed_count=checkpoint.completed_count,
        failed_count=checkpoint.failed_count,
        progress_pct=checkpoint.progress_pct,
        last_success_trade_date=meta.last_success_trade_date or None,
        updated_at=checkpoint.updated_at,
        bundle=_build_bundle_info(settings),
    )


@router.get("/sync/status", response_model=SyncStatusResponse)
async def sync_status() -> SyncStatusResponse:
    settings = get_settings()
    meta = load_sync_meta(settings.sync_meta_path)
    checkpoint = load_checkpoint(settings.checkpoint_path) or get_last_checkpoint()
    if checkpoint is None:
        return SyncStatusResponse(
            running=is_sync_running(),
            last_success_trade_date=meta.last_success_trade_date or None,
            bundle=_build_bundle_info(settings),
        )
    return _checkpoint_to_status(checkpoint, settings)


@router.post("/sync", response_model=SyncStatusResponse)
async def trigger_sync(body: SyncRequest, background_tasks: BackgroundTasks) -> SyncStatusResponse:
    if body.mode not in {"backfill", "incremental"}:
        raise HTTPException(status_code=400, detail="mode 必须为 backfill 或 incremental")
    try:
        await reserve_sync_slot()
    except SyncSlotBusyError:
        raise HTTPException(status_code=409, detail="同步任务已在运行中")

    async def _task() -> None:
        try:
            await run_sync_task(
                mode=body.mode,
                trade_date=body.trade_date,
                start_date=body.start_date,
                end_date=body.end_date,
                resume=body.resume,
                force=body.force,
                limit=body.limit,
                symbols=body.symbols,
            )
        finally:
            await release_sync_slot()

    background_tasks.add_task(_task)

    settings = get_settings()
    meta = load_sync_meta(settings.sync_meta_path)
    return SyncStatusResponse(
        running=True,
        mode=body.mode,
        trade_date=body.trade_date,
        last_success_trade_date=meta.last_success_trade_date or None,
        bundle=_build_bundle_info(settings),
    )


@router.post("/reconcile", response_model=SyncStatusResponse)
async def trigger_reconcile(
    body: ReconcileRequest,
    background_tasks: BackgroundTasks,
) -> SyncStatusResponse:
    try:
        await reserve_sync_slot()
    except SyncSlotBusyError:
        raise HTTPException(status_code=409, detail="同步任务已在运行中")

    async def _task() -> None:
        try:
            await run_reconcile_task(write_manifest=body.write_manifest)
        finally:
            await release_sync_slot()

    background_tasks.add_task(_task)

    settings = get_settings()
    meta = load_sync_meta(settings.sync_meta_path)
    return SyncStatusResponse(
        running=True,
        mode="reconcile",
        last_success_trade_date=meta.last_success_trade_date or None,
        bundle=_build_bundle_info(settings),
    )


@router.post("/reconcile/sync", response_model=SyncStatusResponse)
async def reconcile_sync(body: ReconcileRequest) -> SyncStatusResponse:
    try:
        await reserve_sync_slot()
    except SyncSlotBusyError:
        raise HTTPException(status_code=409, detail="同步任务已在运行中")

    try:
        settings = get_settings()
        settings.ensure_dirs()
        prepare_bundle_for_reconcile(settings, write_manifest=body.write_manifest)
        meta = load_sync_meta(settings.sync_meta_path)
        return SyncStatusResponse(
            running=False,
            mode="reconcile",
            phase="done",
            last_success_trade_date=meta.last_success_trade_date or None,
            bundle=_build_bundle_info(settings),
        )
    finally:
        await release_sync_slot()
