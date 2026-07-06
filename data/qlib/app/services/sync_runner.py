from __future__ import annotations

import logging
import signal
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import pandas as pd

from app.config import Settings, get_settings
from app.logging.stream_hub import get_service_logger
from app.services.symbol_events import append_symbol_event
from app.services.source_bundle import (
    backfill_guard_blocks,
    filter_pending_dates_already_in_snapshot,
    prepare_bundle_for_incremental,
    prepare_bundle_for_reconcile,
    refresh_bundle_from_csv,
    save_symbol_index,
    scan_symbol_index,
    symbol_covers_range,
    validate_bundle,
)
from app.services.sync_meta import SyncMeta, load_sync_meta, save_sync_meta
from app.services.sync_state import FailedSymbol, SyncCheckpoint, load_checkpoint, save_checkpoint
from app.services.tushare_client import TushareClient, TushareError

logger = get_service_logger("qlib_service.sync")

STOCK_BASIC_FIELDS = "ts_code,symbol,name,area,industry,list_date,list_status"
DAILY_FIELDS = "ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount"
SUSPEND_FIELDS = "ts_code,trade_date,suspend_type,suspend_timing"
TRADE_CAL_FIELDS = "exchange,cal_date,is_open"

_shutdown_requested = False


def _handle_shutdown(signum: int, _frame: Any) -> None:
    global _shutdown_requested
    _shutdown_requested = True
    logger.warning("收到中断信号 %s，将在当前步骤完成后退出", signum)


def _date_str(dt: datetime) -> str:
    return dt.strftime("%Y%m%d")


def _symbol_to_fname(ts_code: str) -> str:
    return ts_code.replace(".", "_").lower()


def _csv_path(source_dir: Path, ts_code: str) -> Path:
    return source_dir / f"{_symbol_to_fname(ts_code)}.csv"


def _rows_to_ohlcv_df(rows: list[dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    return pd.DataFrame(
        {
            "date": df["trade_date"],
            "open": df["open"],
            "high": df["high"],
            "low": df["low"],
            "close": df["close"],
            "volume": df["vol"],
            "factor": 1.0,
        }
    )


def merge_daily_csv(path: Path, new_df: pd.DataFrame) -> int:
    new_df = new_df.copy()
    new_df["date"] = new_df["date"].astype(str)
    new_df = new_df.drop_duplicates(subset=["date"], keep="last").sort_values("date")
    if path.exists():
        old = pd.read_csv(path)
        old["date"] = old["date"].astype(str)
        merged = (
            pd.concat([old, new_df], ignore_index=True)
            .drop_duplicates(subset=["date"], keep="last")
            .sort_values("date")
        )
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        merged = new_df
    merged.to_csv(path, index=False)
    return len(new_df)


def _qlib_has_data(qlib_dir: Path) -> bool:
    return (qlib_dir / "calendars" / "day.txt").exists()


def resolve_universe(client: TushareClient) -> tuple[list[str], dict[str, str]]:
    logger.info("拉取 stock_basic，获取全部 A 股上市股票")
    rows = client.call("stock_basic", {"list_status": "L"}, STOCK_BASIC_FIELDS)
    list_dates: dict[str, str] = {}
    symbols: list[str] = []
    for row in rows:
        ts_code = row.get("ts_code")
        if not ts_code:
            continue
        symbols.append(ts_code)
        list_dates[ts_code] = str(row.get("list_date") or "")
    symbols.sort()
    logger.info("A 股股票池共 %d 只", len(symbols))
    return symbols, list_dates


def write_instruments(symbols: list[str], settings: Settings, start_date: str, end_date: str) -> None:
    path = settings.instruments_path
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"{ts_code}\t{start_date}\t{end_date}" for ts_code in symbols]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    logger.info("已写入 instruments: %s", path)


def is_trade_day(client: TushareClient, trade_date: str) -> bool:
    rows = client.call(
        "trade_cal",
        {"exchange": "SSE", "start_date": trade_date, "end_date": trade_date},
        TRADE_CAL_FIELDS,
    )
    return any(str(r.get("is_open")) == "1" for r in rows)


def resolve_latest_open_trade_date(client: TushareClient, *, on_or_before: Optional[datetime] = None) -> str:
    end = on_or_before or datetime.now()
    start = end - timedelta(days=14)
    rows = client.call(
        "trade_cal",
        {"exchange": "SSE", "start_date": _date_str(start), "end_date": _date_str(end), "is_open": "1"},
        TRADE_CAL_FIELDS,
    )
    open_days = sorted(str(r["cal_date"]) for r in rows if r.get("cal_date"))
    if not open_days:
        raise RuntimeError("trade_cal 未返回开市日")
    return open_days[-1]


def resolve_open_trade_dates(client: TushareClient, start_date: str, end_date: str) -> list[str]:
    if start_date > end_date:
        return []
    rows = client.call(
        "trade_cal",
        {"exchange": "SSE", "start_date": start_date, "end_date": end_date, "is_open": "1"},
        TRADE_CAL_FIELDS,
    )
    return sorted(str(r["cal_date"]) for r in rows if r.get("cal_date"))


def _max_date(a: str, b: str) -> str:
    if not a:
        return b
    if not b:
        return a
    return a if a >= b else b


def _day_after(date_str: str) -> str:
    return _date_str(datetime.strptime(date_str, "%Y%m%d") + timedelta(days=1))


def resolve_incremental_watermark(meta: SyncMeta) -> str:
    if meta.last_success_trade_date:
        return meta.last_success_trade_date
    symbol_dates = [entry.last_bar_date for entry in meta.symbols.values() if entry.last_bar_date]
    if symbol_dates:
        inferred = max(symbol_dates)
        logger.info("从 sync_meta.symbols 推断增量水位（快照 max）: %s", inferred)
        return inferred
    return ""


def resolve_pending_incremental_dates(
    client: TushareClient,
    *,
    watermark: str,
    target_date: str,
    force: bool,
) -> list[str]:
    if not watermark:
        return [target_date] if is_trade_day(client, target_date) else []

    start_date = watermark if force else _day_after(watermark)
    if start_date > target_date:
        return []
    return resolve_open_trade_dates(client, start_date, target_date)


def fetch_daily_by_trade_date(client: TushareClient, trade_date: str) -> list[dict[str, Any]]:
    all_rows: list[dict[str, Any]] = []
    offset = 0
    limit = 5000
    while True:
        if offset > 0:
            logger.info("  → daily 分页拉取 trade_date=%s offset=%d …", trade_date, offset)
        rows = client.call(
            "daily",
            {"trade_date": trade_date, "offset": offset, "limit": limit},
            DAILY_FIELDS,
        )
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < limit:
            break
        offset += limit
    return all_rows


def fetch_suspend_by_trade_date(client: TushareClient, trade_date: str) -> dict[str, str]:
    rows = client.call("suspend_d", {"trade_date": trade_date}, SUSPEND_FIELDS)
    result: dict[str, str] = {}
    for row in rows:
        ts_code = row.get("ts_code")
        if not ts_code:
            continue
        result[ts_code] = str(row.get("suspend_type") or "S")
    return result


def fetch_daily_to_csv(
    client: TushareClient,
    ts_code: str,
    start_date: str,
    end_date: str,
    source_dir: Path,
) -> int:
    rows = client.call(
        "daily",
        {"ts_code": ts_code, "start_date": start_date, "end_date": end_date},
        DAILY_FIELDS,
    )
    if not rows:
        return 0
    out = _rows_to_ohlcv_df(rows)
    return merge_daily_csv(_csv_path(source_dir, ts_code), out)


def _update_symbol_bar_meta(meta: SyncMeta, ts_code: str, path: Path, list_date: str = "") -> None:
    entry = meta.ensure_symbol(ts_code, list_date=list_date)
    if path.exists():
        df = pd.read_csv(path)
        if not df.empty and "date" in df.columns:
            entry.last_bar_date = str(df["date"].astype(str).max())
    if entry.status == "suspended" and entry.last_bar_date:
        entry.status = "active"
        entry.suspend_since = ""


def dump_to_qlib_bin(settings: Settings, *, incremental: bool = False) -> None:
    import sys

    source_dir = settings.bars_dir
    qlib_dir = Path(settings.qlib_data_dir)
    if not any(source_dir.glob("*.csv")):
        raise RuntimeError(f"无 CSV 数据可 dump: {source_dir}")

    scripts_dir = Path(__file__).resolve().parents[2] / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))

    use_update = incremental and _qlib_has_data(qlib_dir)
    common_kwargs = dict(
        data_path=str(source_dir),
        qlib_dir=str(qlib_dir),
        freq="day",
        date_field_name="date",
        symbol_field_name="symbol",
        exclude_fields="date,symbol",
        max_workers=4,
    )

    try:
        if use_update:
            from dump_daily import run_daily_dump

            logger.info("使用 dump_daily 增量转换 CSV -> qlib bin（先日历，再按需更新）")
            plan = run_daily_dump(settings, max_workers=common_kwargs["max_workers"])
            if plan.mode == "skip":
                logger.info("dump_daily 跳过: %s", plan.reason)
        else:
            from dump_bin import DumpDataAll

            logger.info("使用 DumpDataAll 全量转换 CSV -> qlib bin")
            DumpDataAll(**common_kwargs).dump()
        return
    except ImportError as exc:
        logger.warning("无法直接导入 dump_bin，回退 subprocess: %s", exc)

    if use_update:
        cmd = [sys.executable, str(scripts_dir / "dump_daily.py")]
        label = "dump_daily"
    else:
        cmd = [
            sys.executable,
            str(scripts_dir / "dump_bin.py"),
            "dump_all",
            "--data_path",
            str(source_dir),
            "--qlib_dir",
            str(qlib_dir),
            "--freq",
            "day",
            "--date_field_name",
            "date",
            "--symbol_field_name",
            "symbol",
            "--exclude_fields",
            "date,symbol",
        ]
        label = "dump_bin"
    logger.info("执行 %s: %s", label, " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.stdout:
        logger.info(result.stdout.strip())
    if result.returncode != 0:
        if result.stderr:
            logger.error(result.stderr.strip())
        raise RuntimeError(f"{label} 失败，exit={result.returncode}")


def sanity_check_qlib(settings: Settings) -> None:
    import qlib
    from qlib.data import D

    qlib.init(provider_uri=str(settings.qlib_data_dir), region="cn")
    calendar = D.calendar(start_time="2024-01-01", end_time="2024-01-31", freq="day")
    logger.info("qlib sanity check: calendar 样本 %d 条", len(calendar))


def _sync_incremental_trade_date(
    *,
    client: TushareClient,
    trade_date: str,
    symbols: list[str],
    list_dates: dict[str, str],
    source_dir: Path,
    meta: SyncMeta,
    events_path: Path,
) -> tuple[int, int]:
    logger.info("  → 正在拉取 %s 全市场日线截面 …", trade_date)
    daily_rows = fetch_daily_by_trade_date(client, trade_date)
    traded_codes = {str(r["ts_code"]) for r in daily_rows if r.get("ts_code")}
    by_symbol: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in daily_rows:
        by_symbol[str(row["ts_code"])].append(row)

    logger.info("  → 正在拉取 %s 停牌列表 …", trade_date)
    suspended = fetch_suspend_by_trade_date(client, trade_date)
    logger.info(
        "  → 截面 %s: 成交 %d 只，停牌 %d 只，开始合并 CSV …",
        trade_date,
        len(traded_codes),
        len(suspended),
    )

    for ts_code, rows in by_symbol.items():
        out = _rows_to_ohlcv_df(rows)
        path = _csv_path(source_dir, ts_code)
        merge_daily_csv(path, out)
        entry = meta.ensure_symbol(ts_code, list_date=list_dates.get(ts_code, ""))
        entry.last_bar_date = _max_date(entry.last_bar_date, trade_date)
        entry.status = "active"
        entry.suspend_since = ""
        append_symbol_event(
            events_path,
            trade_date=trade_date,
            ts_code=ts_code,
            event="traded",
            extra={"rows": len(rows)},
        )

    for ts_code, suspend_type in suspended.items():
        entry = meta.ensure_symbol(ts_code, list_date=list_dates.get(ts_code, ""))
        if suspend_type.upper().startswith("R"):
            entry.status = "active"
            entry.suspend_since = ""
            append_symbol_event(
                events_path,
                trade_date=trade_date,
                ts_code=ts_code,
                event="resumed",
                reason=suspend_type,
            )
        else:
            entry.status = "suspended"
            if not entry.suspend_since:
                entry.suspend_since = trade_date
            append_symbol_event(
                events_path,
                trade_date=trade_date,
                ts_code=ts_code,
                event="suspended",
                reason=suspend_type,
            )

    symbol_set = set(symbols)
    for ts_code in symbol_set - traded_codes - set(suspended):
        list_date = list_dates.get(ts_code, "")
        if list_date and list_date > trade_date:
            append_symbol_event(
                events_path,
                trade_date=trade_date,
                ts_code=ts_code,
                event="not_listed",
                reason="before_list_date",
            )
            continue
        entry = meta.ensure_symbol(ts_code, list_date=list_date)
        if entry.status != "suspended":
            append_symbol_event(
                events_path,
                trade_date=trade_date,
                ts_code=ts_code,
                event="no_bar",
                reason="not_in_daily_cross_section",
            )

    logger.info("  → %s CSV 合并完成", trade_date)
    return len(traded_codes), len(suspended)


def run_incremental_sync(
    *,
    trade_date: Optional[str] = None,
    force: bool = False,
    skip_dump: bool = False,
    settings: Optional[Settings] = None,
) -> SyncCheckpoint:
    global _shutdown_requested
    _shutdown_requested = False

    settings = settings or get_settings()
    settings.ensure_dirs()
    logger.info("增量同步开始（仅 CSV，skip_dump=%s）", skip_dump)
    client = TushareClient(settings)
    source_dir = settings.bars_dir
    logger.info("正在准备 bundle（sync_meta / symbol_index）…")
    meta, index = prepare_bundle_for_incremental(settings)
    for warning in validate_bundle(settings):
        logger.warning("bundle 校验: %s", warning)
    events_path = settings.symbol_events_path
    checkpoint_path = settings.checkpoint_path

    checkpoint = SyncCheckpoint(mode="incremental", phase="resolve_trade_date")
    logger.info("正在查询最近开市日 …")
    target_date = trade_date or resolve_latest_open_trade_date(client)
    checkpoint.trade_date = target_date
    logger.info("目标交易日: %s", target_date)

    watermark = resolve_incremental_watermark(meta)
    logger.info("正在计算待补交易日（当前水位 %s）…", watermark or "(无)")
    pending_dates = resolve_pending_incremental_dates(
        client,
        watermark=watermark,
        target_date=target_date,
        force=force,
    )
    skipped_count = len(pending_dates)
    pending_dates = filter_pending_dates_already_in_snapshot(pending_dates, index)
    if skipped_count > len(pending_dates):
        logger.info(
            "CSV 快照已覆盖 %d 个交易日，跳过 API（保留 %d 个待同步日）",
            skipped_count - len(pending_dates),
            len(pending_dates),
        )

    if not pending_dates:
        logger.info(
            "增量已是最新（watermark=%s, target=%s），跳过 API 拉取",
            watermark or "(无)",
            target_date,
        )
        logger.info("正在从 CSV reconcile 水位 …")
        meta, _ = refresh_bundle_from_csv(settings, meta)
        checkpoint.phase = "done"
        save_checkpoint(checkpoint_path, checkpoint)
        return checkpoint

    if len(pending_dates) <= 5:
        dates_summary = ", ".join(pending_dates)
    else:
        dates_summary = f"{pending_dates[0]} … {pending_dates[-1]}（共 {len(pending_dates)} 个）"
    logger.info("待补交易日: %s", dates_summary)

    logger.info(
        "增量补洞 %s -> %s，共 %d 个交易日待同步（watermark=%s）",
        pending_dates[0],
        pending_dates[-1],
        len(pending_dates),
        watermark or "(无)",
    )

    logger.info("正在拉取 A 股股票池 stock_basic …")
    symbols, list_dates = resolve_universe(client)
    meta.universe = symbols

    checkpoint.gap_trade_dates = pending_dates
    checkpoint.completed_gap_dates = []
    checkpoint.symbols_total = len(pending_dates)
    checkpoint.phase = "merge_csv"
    save_checkpoint(checkpoint_path, checkpoint)

    last_traded = 0
    last_suspended = 0
    for idx, day in enumerate(pending_dates, start=1):
        if _shutdown_requested:
            logger.warning("增量同步被中断，水位已保存至 %s", meta.last_success_trade_date)
            save_sync_meta(settings.sync_meta_path, meta)
            save_checkpoint(checkpoint_path, checkpoint)
            return checkpoint

        checkpoint.trade_date = day
        logger.info("—— 交易日 [%d/%d]: %s ——", idx, len(pending_dates), day)
        last_traded, last_suspended = _sync_incremental_trade_date(
            client=client,
            trade_date=day,
            symbols=symbols,
            list_dates=list_dates,
            source_dir=source_dir,
            meta=meta,
            events_path=events_path,
        )
        meta.last_success_trade_date = day
        checkpoint.completed_gap_dates.append(day)
        save_sync_meta(settings.sync_meta_path, meta)
        save_checkpoint(checkpoint_path, checkpoint)

    logger.info("正在从 CSV reconcile 水位与 symbol_index …")
    meta, _ = refresh_bundle_from_csv(settings, meta)
    logger.info("CSV 同步完成，水位: %s", meta.last_success_trade_date or "(无)")

    if not skip_dump:
        checkpoint.phase = "dump"
        save_checkpoint(checkpoint_path, checkpoint)
        dump_to_qlib_bin(settings, incremental=True)
        try:
            sanity_check_qlib(settings)
        except Exception as exc:
            logger.warning("qlib sanity check 跳过: %s", exc)
    else:
        logger.info("skip_dump=True，CSV 同步结束，bin 转换留待 dump_daily")

    append_symbol_event(
        events_path,
        trade_date=target_date,
        ts_code="*",
        event="incremental",
        reason="done",
        extra={
            "gap_days": len(pending_dates),
            "from": pending_dates[0],
            "to": pending_dates[-1],
            "traded": last_traded,
            "suspended": last_suspended,
        },
    )
    checkpoint.phase = "done"
    save_checkpoint(checkpoint_path, checkpoint)
    logger.info(
        "增量同步完成: %s ~ %s（%d 个交易日）",
        pending_dates[0],
        pending_dates[-1],
        len(pending_dates),
    )
    return checkpoint


def run_backfill_sync(
    *,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    resume: bool = True,
    force: bool = False,
    limit: Optional[int] = None,
    symbols_filter: Optional[list[str]] = None,
    settings: Optional[Settings] = None,
    install_signal_handlers: bool = True,
) -> SyncCheckpoint:
    global _shutdown_requested
    _shutdown_requested = False

    settings = settings or get_settings()
    settings.ensure_dirs()

    guard_msg = backfill_guard_blocks(settings, force=force, symbols_filter=symbols_filter)
    if guard_msg:
        raise RuntimeError(guard_msg)

    if install_signal_handlers:
        signal.signal(signal.SIGINT, _handle_shutdown)
        signal.signal(signal.SIGTERM, _handle_shutdown)

    end_dt = datetime.strptime(end_date, "%Y%m%d") if end_date else datetime.now()
    start_dt = (
        datetime.strptime(start_date, "%Y%m%d")
        if start_date
        else end_dt - timedelta(days=settings.lookback_days)
    )
    start = _date_str(start_dt)
    end = _date_str(end_dt)

    checkpoint_path = settings.checkpoint_path
    checkpoint = load_checkpoint(checkpoint_path) if resume and not force else None
    if checkpoint is None or force or checkpoint.mode != "backfill":
        checkpoint = SyncCheckpoint(
            mode="backfill",
            phase="resolve_symbols",
            start_date=start,
            end_date=end,
        )
        save_checkpoint(checkpoint_path, checkpoint)

    client = TushareClient(settings)
    source_dir = settings.bars_dir
    meta = load_sync_meta(settings.sync_meta_path)
    events_path = settings.symbol_events_path
    list_dates: dict[str, str] = {}

    if symbols_filter and checkpoint.phase != "resolve_symbols":
        allow = set(symbols_filter)
        universe, list_dates = resolve_universe(client)
        symbols = [s for s in universe if s in allow]
        if not symbols:
            raise RuntimeError(f"symbols 无效: {symbols_filter}")
        checkpoint.symbols = symbols
        checkpoint.symbols_total = len(symbols)
        checkpoint.phase = "fetch"
        checkpoint.completed_symbols = [s for s in checkpoint.completed_symbols if s not in allow]
        for ts_code in allow:
            checkpoint.failed_symbols.pop(ts_code, None)
        if not checkpoint.start_date:
            checkpoint.start_date = start
        if not checkpoint.end_date:
            checkpoint.end_date = end
        save_checkpoint(checkpoint_path, checkpoint)
        logger.info("指定股票补拉 %d 只: %s", len(symbols), ", ".join(symbols))
    elif checkpoint.phase == "resolve_symbols":
        symbols, list_dates = resolve_universe(client)
        if symbols_filter:
            allow = set(symbols_filter)
            symbols = [s for s in symbols if s in allow]
        if limit is not None:
            symbols = symbols[:limit]
        checkpoint.symbols = symbols
        checkpoint.symbols_total = len(symbols)
        checkpoint.phase = "fetch"
        meta.universe = symbols
        for ts_code in symbols:
            meta.ensure_symbol(ts_code, list_date=list_dates.get(ts_code, ""))
        write_instruments(symbols, settings, start, end)
        save_checkpoint(checkpoint_path, checkpoint)
        save_sync_meta(settings.sync_meta_path, meta)
    else:
        _, list_dates = resolve_universe(client)

    completed = set(checkpoint.completed_symbols)
    pending = [s for s in checkpoint.symbols if s not in completed]

    if checkpoint.phase == "fetch":
        symbol_index = scan_symbol_index(settings.bars_dir)
        save_symbol_index(settings.symbol_index_path, symbol_index)
        logger.info(
            "回填日线 %s ~ %s，待处理 %d/%d",
            checkpoint.start_date,
            checkpoint.end_date,
            len(pending),
            checkpoint.symbols_total,
        )
        for idx, ts_code in enumerate(pending, start=1):
            if _shutdown_requested:
                logger.warning("回填被中断，checkpoint 已保存，可使用 --resume 继续")
                save_checkpoint(checkpoint_path, checkpoint)
                save_sync_meta(settings.sync_meta_path, meta)
                return checkpoint

            if symbol_covers_range(
                symbol_index,
                ts_code,
                checkpoint.start_date,
                checkpoint.end_date,
            ):
                checkpoint.completed_symbols.append(ts_code)
                checkpoint.failed_symbols.pop(ts_code, None)
                save_checkpoint(checkpoint_path, checkpoint)
                logger.info(
                    "[%d/%d] %s 已覆盖 %s~%s，跳过",
                    len(checkpoint.completed_symbols),
                    checkpoint.symbols_total,
                    ts_code,
                    checkpoint.start_date,
                    checkpoint.end_date,
                )
                continue

            failed = checkpoint.failed_symbols.get(ts_code)
            if failed and failed.attempts >= settings.max_failed_attempts:
                logger.warning("跳过已达最大重试次数的股票: %s", ts_code)
                continue

            try:
                count = fetch_daily_to_csv(
                    client,
                    ts_code,
                    checkpoint.start_date,
                    checkpoint.end_date,
                    source_dir,
                )
                path = _csv_path(source_dir, ts_code)
                _update_symbol_bar_meta(
                    meta,
                    ts_code,
                    path,
                    list_date=list_dates.get(ts_code, ""),
                )
                if count == 0:
                    append_symbol_event(
                        events_path,
                        trade_date=checkpoint.end_date,
                        ts_code=ts_code,
                        event="no_bar",
                        reason="backfill_empty",
                    )
                else:
                    append_symbol_event(
                        events_path,
                        trade_date=checkpoint.end_date,
                        ts_code=ts_code,
                        event="backfill",
                        extra={"rows": count},
                    )
                checkpoint.completed_symbols.append(ts_code)
                checkpoint.failed_symbols.pop(ts_code, None)
                save_checkpoint(checkpoint_path, checkpoint)
                save_sync_meta(settings.sync_meta_path, meta)
                logger.info(
                    "[%d/%d] %s 完成，%d 条",
                    len(checkpoint.completed_symbols),
                    checkpoint.symbols_total,
                    ts_code,
                    count,
                )
            except (TushareError, Exception) as exc:
                entry = checkpoint.failed_symbols.get(ts_code, FailedSymbol())
                entry.attempts += 1
                entry.error = str(exc)
                checkpoint.failed_symbols[ts_code] = entry
                save_checkpoint(checkpoint_path, checkpoint)
                logger.error("[%d/%d] %s 失败 (attempt=%d): %s", idx, len(pending), ts_code, entry.attempts, exc)
                if _shutdown_requested:
                    return checkpoint

        checkpoint.phase = "dump"
        save_checkpoint(checkpoint_path, checkpoint)

    if checkpoint.phase == "dump":
        incremental_dump = _qlib_has_data(Path(settings.qlib_data_dir))
        dump_to_qlib_bin(settings, incremental=incremental_dump)
        try:
            sanity_check_qlib(settings)
        except Exception as exc:
            logger.warning("qlib sanity check 跳过: %s", exc)
        if checkpoint.end_date > meta.last_success_trade_date:
            meta.last_success_trade_date = checkpoint.end_date
        save_sync_meta(settings.sync_meta_path, meta)
        checkpoint.phase = "done"
        save_checkpoint(checkpoint_path, checkpoint)
        logger.info("回填同步完成")

    return checkpoint


def run_reconcile_only(*, settings: Optional[Settings] = None, write_manifest: bool = False) -> None:
    settings = settings or get_settings()
    settings.ensure_dirs()
    prepare_bundle_for_reconcile(settings, write_manifest=write_manifest)
    for warning in validate_bundle(settings):
        logger.warning("bundle 校验: %s", warning)
    logger.info("reconcile 完成")


def run_sync(
    *,
    mode: str = "backfill",
    trade_date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    resume: bool = True,
    force: bool = False,
    limit: Optional[int] = None,
    symbols: Optional[list[str]] = None,
    reconcile_only: bool = False,
    write_manifest: bool = False,
    skip_dump: bool = False,
    settings: Optional[Settings] = None,
    install_signal_handlers: bool = True,
) -> SyncCheckpoint:
    if reconcile_only:
        run_reconcile_only(settings=settings, write_manifest=write_manifest)
        return SyncCheckpoint(mode="reconcile", phase="done")
    if mode == "incremental":
        return run_incremental_sync(
            trade_date=trade_date,
            force=force,
            skip_dump=skip_dump,
            settings=settings,
        )
    return run_backfill_sync(
        start_date=start_date,
        end_date=end_date,
        resume=resume,
        force=force,
        limit=limit,
        symbols_filter=symbols,
        settings=settings,
        install_signal_handlers=install_signal_handlers,
    )
