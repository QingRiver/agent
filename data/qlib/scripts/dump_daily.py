#!/usr/bin/env python3
"""Daily qlib bin update: extend calendar first, then dump only changed symbols."""
from __future__ import annotations

import argparse
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import Settings, get_settings
from app.services.source_bundle import index_global_max, load_symbol_index, scan_symbol_index
from app.services.sync_meta import load_sync_meta

logger = logging.getLogger(__name__)


@dataclass
class DailyDumpPlan:
    mode: str  # full | partial | calendar_only | skip
    reason: str = ""
    append_calendar: list[str] | None = None
    only_files: list[str] | None = None
    dirty_symbol_count: int = 0
    csv_watermark: str = ""


def _ts_code_to_fname(ts_code: str) -> str:
    return ts_code.replace(".", "_").lower()


def _qlib_symbol_to_ts_code(symbol: str) -> str:
    """instruments/all.txt 使用 qlib 格式（000001_SZ），统一为 Tushare 格式（000001.SZ）。"""
    text = symbol.strip()
    if "." in text:
        code, suffix = text.rsplit(".", 1)
        return f"{code}.{suffix.upper()}"
    if "_" in text:
        code, suffix = text.rsplit("_", 1)
        return f"{code}.{suffix.upper()}"
    return text.upper()


def _qlib_has_data(qlib_dir: Path) -> bool:
    return (qlib_dir / "calendars" / "day.txt").exists()


def _normalize_yyyymmdd(value: str) -> str:
    return value.replace("-", "")[:8]


def _to_timestamp(value: str) -> pd.Timestamp:
    text = _normalize_yyyymmdd(value)
    return pd.Timestamp(f"{text[:4]}-{text[4:6]}-{text[6:8]}")


def _needs_bin_update(csv_last: str, inst_end: str) -> bool:
    """与 DumpDataUpdate 一致：仅当 CSV 最大日期严格晚于 instruments 结束日才需 dump。"""
    if not csv_last:
        return False
    if not inst_end:
        return True
    return _to_timestamp(csv_last) > _to_timestamp(inst_end)


def _read_calendar_last(qlib_dir: Path) -> str:
    cal_path = qlib_dir / "calendars" / "day.txt"
    if not cal_path.exists():
        return ""
    lines = [line.strip() for line in cal_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    return _normalize_yyyymmdd(lines[-1]) if lines else ""


def _read_instruments_end(qlib_dir: Path) -> dict[str, str]:
    path = qlib_dir / "instruments" / "all.txt"
    if not path.exists():
        return {}
    result: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.strip().split("\t")
        if len(parts) < 3:
            continue
        ts_code = _qlib_symbol_to_ts_code(parts[0])
        result[ts_code] = _normalize_yyyymmdd(parts[2])
    return result


def _collect_new_calendar_dates(bars_dir: Path, last_cal_yyyymmdd: str, watermark: str) -> list[str]:
    ref = bars_dir / "000001_sz.csv"
    if not ref.exists():
        for path in sorted(bars_dir.glob("*.csv")):
            ref = path
            break
    if not ref.exists():
        return []

    dates = pd.read_csv(ref, usecols=["date"])["date"].astype(str)
    new_dates = sorted({day for day in dates if day > last_cal_yyyymmdd and day <= watermark})
    return [f"{day[:4]}-{day[4:6]}-{day[6:8]}" for day in new_dates]


def _load_fresh_index(settings: Settings):
    index = load_symbol_index(settings.symbol_index_path)
    if index.symbols:
        return index
    return scan_symbol_index(settings.bars_dir)


def plan_daily_dump(settings: Settings) -> DailyDumpPlan:
    qlib_dir = Path(settings.qlib_data_dir)
    bars_dir = settings.bars_dir
    meta = load_sync_meta(settings.sync_meta_path)

    if not _qlib_has_data(qlib_dir):
        return DailyDumpPlan(mode="full", reason="qlib_data 尚未初始化")

    index = _load_fresh_index(settings)
    csv_watermark = index_global_max(index) or meta.last_success_trade_date
    if not csv_watermark:
        return DailyDumpPlan(mode="skip", reason="无 CSV 水位，请先执行 incremental 同步")

    last_cal = _read_calendar_last(qlib_dir)
    append_calendar = (
        _collect_new_calendar_dates(bars_dir, last_cal, csv_watermark)
        if last_cal and csv_watermark > last_cal
        else []
    )

    instruments_end = _read_instruments_end(qlib_dir)
    only_files: list[str] = []
    for ts_code, entry in index.symbols.items():
        if _needs_bin_update(entry.last_date, instruments_end.get(ts_code, "")):
            only_files.append(_ts_code_to_fname(ts_code))

    if not append_calendar and not only_files:
        return DailyDumpPlan(
            mode="skip",
            reason=f"bin 已与 CSV 对齐（CSV 水位 {csv_watermark}，日历 {last_cal or '(无)'}）",
            csv_watermark=csv_watermark,
        )

    if append_calendar and not only_files:
        return DailyDumpPlan(
            mode="calendar_only",
            append_calendar=append_calendar,
            only_files=[],
            dirty_symbol_count=0,
            csv_watermark=csv_watermark,
        )

    return DailyDumpPlan(
        mode="partial",
        append_calendar=append_calendar,
        only_files=only_files,
        dirty_symbol_count=len(only_files),
        csv_watermark=csv_watermark,
    )


def run_daily_dump(settings: Optional[Settings] = None, *, max_workers: int = 4) -> DailyDumpPlan:
    settings = settings or get_settings()
    settings.ensure_dirs()

    from dump_bin import DumpDataAll, DumpDataUpdate

    plan = plan_daily_dump(settings)
    common_kwargs = dict(
        data_path=str(settings.bars_dir),
        qlib_dir=str(settings.qlib_data_dir),
        freq="day",
        date_field_name="date",
        symbol_field_name="symbol",
        exclude_fields="date,symbol",
        max_workers=max_workers,
    )

    if plan.mode == "skip":
        logger.info("跳过 dump: %s", plan.reason)
        return plan

    if plan.mode == "full":
        logger.info("qlib_data 未初始化，执行全量 DumpDataAll")
        DumpDataAll(**common_kwargs).dump()
        return plan

    append_calendar = ",".join(plan.append_calendar or [])

    if plan.mode == "calendar_only":
        logger.info("仅更新 calendars/day.txt（+%d 日，CSV 水位 %s）", len(plan.append_calendar or []), plan.csv_watermark)
        DumpDataUpdate(
            **common_kwargs,
            append_calendar=append_calendar,
        ).save_calendar_only()
        return plan

    only_files = ",".join(plan.only_files or [])
    logger.info(
        "每日增量 dump: 日历 +%d 日, 更新 %d 只股票（CSV 水位 %s）",
        len(plan.append_calendar or []),
        plan.dirty_symbol_count,
        plan.csv_watermark,
    )

    updater = DumpDataUpdate(
        **common_kwargs,
        only_files=only_files,
        append_calendar=append_calendar,
        skip_calendar_save=True,
    )
    if append_calendar:
        logger.info("先更新 calendars/day.txt …")
        updater.save_calendar_only()
    updater.dump()
    return plan


def main() -> int:
    parser = argparse.ArgumentParser(description="每日 qlib bin 增量更新（先日历，再按需 dump）")
    parser.add_argument("--max-workers", type=int, default=4)
    parser.add_argument("--dry-run", action="store_true", help="仅输出计划，不执行 dump")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
    settings = get_settings()
    settings.ensure_dirs()

    plan = plan_daily_dump(settings)
    if args.dry_run:
        logger.info("mode=%s reason=%s", plan.mode, plan.reason or "(无)")
        logger.info("csv_watermark=%s", plan.csv_watermark)
        logger.info("calendar_append=%s", plan.append_calendar)
        logger.info("dirty_symbols=%d", plan.dirty_symbol_count)
        return 0

    run_daily_dump(settings, max_workers=args.max_workers)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
