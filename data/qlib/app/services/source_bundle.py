from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import pandas as pd

from app.config import Settings
from app.services.sync_meta import SyncMeta, load_sync_meta, save_sync_meta

SCHEMA_VERSION = 1
BACKFILL_GUARD_MIN_SYMBOLS = 100


@dataclass
class SymbolIndexEntry:
    first_date: str = ""
    last_date: str = ""
    row_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SymbolIndexEntry:
        return cls(
            first_date=str(data.get("first_date", "")),
            last_date=str(data.get("last_date", "")),
            row_count=int(data.get("row_count", 0)),
        )


@dataclass
class SymbolIndex:
    symbols: dict[str, SymbolIndexEntry] = field(default_factory=dict)
    updated_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbols": {k: v.to_dict() for k, v in self.symbols.items()},
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SymbolIndex:
        symbols = {
            k: SymbolIndexEntry.from_dict(v) if isinstance(v, dict) else v
            for k, v in data.get("symbols", {}).items()
        }
        return cls(symbols=symbols, updated_at=data.get("updated_at", ""))

    def touch(self) -> None:
        self.updated_at = datetime.now(timezone.utc).isoformat()


def _fname_to_ts_code(fname: str) -> str:
    base = fname.replace(".csv", "")
    parts = base.rsplit("_", 1)
    if len(parts) == 2:
        return f"{parts[0]}.{parts[1].upper()}"
    return base


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


def scan_symbol_index(bars_dir: Path) -> SymbolIndex:
    index = SymbolIndex()
    if not bars_dir.exists():
        return index

    for path in sorted(bars_dir.glob("*.csv")):
        try:
            df = pd.read_csv(path, usecols=["date"])
        except (ValueError, pd.errors.EmptyDataError, FileNotFoundError):
            continue
        if df.empty:
            continue
        dates = df["date"].astype(str)
        ts_code = _fname_to_ts_code(path.name)
        index.symbols[ts_code] = SymbolIndexEntry(
            first_date=str(dates.min()),
            last_date=str(dates.max()),
            row_count=len(df),
        )
    index.touch()
    return index


def load_symbol_index(path: Path) -> SymbolIndex:
    if not path.exists():
        return SymbolIndex()
    with path.open(encoding="utf-8") as f:
        return SymbolIndex.from_dict(json.load(f))


def save_symbol_index(path: Path, index: SymbolIndex) -> None:
    index.touch()
    _atomic_write_json(path, index.to_dict())


def conservative_watermark(meta: SyncMeta) -> str:
    dates = [entry.last_bar_date for entry in meta.symbols.values() if entry.last_bar_date]
    if not dates:
        return meta.last_success_trade_date or ""
    return min(dates)


def snapshot_watermark(meta: SyncMeta) -> str:
    dates = [entry.last_bar_date for entry in meta.symbols.values() if entry.last_bar_date]
    if not dates:
        return meta.last_success_trade_date or ""
    return max(dates)


def index_global_max(index: SymbolIndex) -> str:
    dates = [entry.last_date for entry in index.symbols.values() if entry.last_date]
    return max(dates) if dates else ""


def bootstrap_meta_from_index(meta: SyncMeta, index: SymbolIndex) -> SyncMeta:
    for ts_code, entry in index.symbols.items():
        sym = meta.ensure_symbol(ts_code)
        sym.last_bar_date = entry.last_date
    watermark = index_global_max(index) or snapshot_watermark(meta)
    if watermark:
        meta.last_success_trade_date = watermark
    meta.touch()
    return meta


def reconcile_meta(meta: SyncMeta, index: SymbolIndex) -> SyncMeta:
    return bootstrap_meta_from_index(meta, index)


def filter_pending_dates_already_in_snapshot(
    pending: list[str],
    index: SymbolIndex,
) -> list[str]:
    """跳过 CSV 快照已覆盖的交易日（避免 zip 初始化后重复拉 API）。"""
    global_max = index_global_max(index)
    if not global_max:
        return pending
    return [day for day in pending if day > global_max]


def needs_bootstrap(meta: SyncMeta, bars_dir: Path, meta_path: Path) -> bool:
    if not meta_path.exists():
        return bars_dir.exists() and any(bars_dir.glob("*.csv"))
    if not meta.last_success_trade_date and not meta.symbols:
        return bars_dir.exists() and any(bars_dir.glob("*.csv"))
    return False


def bootstrap_from_csv(
    settings: Settings,
    *,
    save: bool = True,
) -> tuple[SyncMeta, SymbolIndex]:
    bars_dir = settings.bars_dir
    index = scan_symbol_index(bars_dir)
    meta = SyncMeta()
    meta = bootstrap_meta_from_index(meta, index)
    if save:
        save_sync_meta(settings.sync_meta_path, meta)
        save_symbol_index(settings.symbol_index_path, index)
    return meta, index


def load_or_scan_index(settings: Settings) -> SymbolIndex:
    cached = load_symbol_index(settings.symbol_index_path)
    if cached.symbols:
        return cached
    index = scan_symbol_index(settings.bars_dir)
    if index.symbols:
        save_symbol_index(settings.symbol_index_path, index)
    return index


def prepare_bundle_for_incremental(settings: Settings) -> tuple[SyncMeta, SymbolIndex]:
    meta = load_sync_meta(settings.sync_meta_path)
    if needs_bootstrap(meta, settings.bars_dir, settings.sync_meta_path):
        return bootstrap_from_csv(settings)
    index = load_or_scan_index(settings)
    meta = reconcile_meta(meta, index)
    save_sync_meta(settings.sync_meta_path, meta)
    return meta, index


def prepare_bundle_for_reconcile(settings: Settings, *, write_manifest: bool = False) -> tuple[SyncMeta, SymbolIndex]:
    meta = load_sync_meta(settings.sync_meta_path)
    if needs_bootstrap(meta, settings.bars_dir, settings.sync_meta_path):
        meta, index = bootstrap_from_csv(settings)
    else:
        index = scan_symbol_index(settings.bars_dir)
        meta = reconcile_meta(meta, index)
        save_sync_meta(settings.sync_meta_path, meta)
        save_symbol_index(settings.symbol_index_path, index)
    if write_manifest:
        build_data_manifest(settings, index)
    return meta, index


def build_data_manifest(settings: Settings, index: Optional[SymbolIndex] = None) -> dict[str, Any]:
    if index is None:
        index = scan_symbol_index(settings.bars_dir)
    first_dates = [e.first_date for e in index.symbols.values() if e.first_date]
    last_dates = [e.last_date for e in index.symbols.values() if e.last_date]
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "packaged_at": datetime.now(timezone.utc).isoformat(),
        "symbol_count": len(index.symbols),
        "global_min_date": min(first_dates) if first_dates else "",
        "global_max_date": max(last_dates) if last_dates else "",
    }
    _atomic_write_json(settings.data_manifest_path, manifest)
    return manifest


def load_data_manifest(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def validate_bundle(settings: Settings) -> list[str]:
    warnings: list[str] = []
    bars_dir = settings.bars_dir
    csv_count = len(list(bars_dir.glob("*.csv"))) if bars_dir.exists() else 0
    if csv_count == 0:
        warnings.append("cn_1d 下无 CSV 文件")
        return warnings

    index = load_or_scan_index(settings)
    if len(index.symbols) != csv_count:
        warnings.append(f"symbol_index 股数 {len(index.symbols)} 与 CSV 文件数 {csv_count} 不一致")

    manifest = load_data_manifest(settings.data_manifest_path)
    if manifest:
        expected = manifest.get("symbol_count")
        if expected is not None and expected != csv_count:
            warnings.append(f"data_manifest.symbol_count={expected} 与 CSV 文件数 {csv_count} 不一致")

    meta = load_sync_meta(settings.sync_meta_path)
    if meta.last_success_trade_date:
        watermark = conservative_watermark(meta)
        if watermark and watermark < meta.last_success_trade_date:
            warnings.append(
                f"部分股票落后：全局水位 {meta.last_success_trade_date}，"
                f"最慢股票仅到 {watermark}"
            )
    return warnings


def symbol_covers_range(index: SymbolIndex, ts_code: str, start: str, end: str) -> bool:
    entry = index.symbols.get(ts_code)
    if entry is None or not entry.first_date or not entry.last_date:
        return False
    return entry.first_date <= start and entry.last_date >= end


def index_from_meta(meta: SyncMeta) -> SymbolIndex:
    index = SymbolIndex()
    for ts_code, entry in meta.symbols.items():
        if entry.last_bar_date:
            index.symbols[ts_code] = SymbolIndexEntry(
                first_date="",
                last_date=entry.last_bar_date,
                row_count=0,
            )
    index.touch()
    return index


def backfill_guard_blocks(
    settings: Settings,
    *,
    force: bool,
    symbols_filter: Optional[list[str]] = None,
) -> Optional[str]:
    if force or symbols_filter:
        return None
    csv_count = len(list(settings.bars_dir.glob("*.csv"))) if settings.bars_dir.exists() else 0
    if csv_count < BACKFILL_GUARD_MIN_SYMBOLS:
        return None
    meta = load_sync_meta(settings.sync_meta_path)
    if meta.last_success_trade_date or meta.symbols:
        return (
            f"检测到已有 {csv_count} 只股票 CSV 及 sync_meta，"
            "请使用 incremental 增量同步；若确需全量重拉请加 --force"
        )
    index = load_or_scan_index(settings)
    if len(index.symbols) >= BACKFILL_GUARD_MIN_SYMBOLS:
        return (
            f"检测到已有 {len(index.symbols)} 只股票 CSV，"
            "请使用 incremental 增量同步；若确需全量重拉请加 --force"
        )
    return None
