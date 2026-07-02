from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import get_settings
from app.logging.stream_hub import get_log_hub, get_service_logger
from app.services.sync_runner import run_sync


def main() -> int:
    parser = argparse.ArgumentParser(description="Tushare A 股行情同步到 qlib")
    parser.add_argument(
        "--mode",
        choices=["backfill", "incremental"],
        default="backfill",
        help="backfill=历史回填, incremental=按交易日增量",
    )
    parser.add_argument("--trade-date", dest="trade_date", default=None, help="增量目标交易日 YYYYMMDD（补洞至该日）")
    parser.add_argument("--start-date", dest="start_date", default=None, help="回填起始 YYYYMMDD")
    parser.add_argument("--end-date", dest="end_date", default=None, help="回填结束 YYYYMMDD")
    parser.add_argument("--resume", action="store_true", help="从 checkpoint 续传（仅 backfill）")
    parser.add_argument("--force", action="store_true", help="忽略水位/checkpoint 强制重跑")
    parser.add_argument("--limit", type=int, default=None, help="限制股票数量（调试）")
    parser.add_argument("--symbols", nargs="*", default=None, help="仅回填指定 ts_code")
    parser.add_argument(
        "--reconcile-only",
        action="store_true",
        help="从 CSV 扫描/bootstrap sync_meta，不触发 backfill/incremental",
    )
    parser.add_argument(
        "--write-manifest",
        action="store_true",
        help="与 --reconcile-only 联用，写入 data_manifest.json",
    )
    args = parser.parse_args()

    settings = get_settings()
    settings.ensure_dirs()

    hub = get_log_hub()
    import asyncio

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub.start(loop)

    logging.basicConfig(level=logging.INFO)
    logger = get_service_logger("qlib_service.cli")

    try:
        checkpoint = run_sync(
            mode=args.mode,
            trade_date=args.trade_date,
            start_date=args.start_date,
            end_date=args.end_date,
            resume=args.resume or not args.force,
            force=args.force,
            limit=args.limit,
            symbols=args.symbols,
            reconcile_only=args.reconcile_only,
            write_manifest=args.write_manifest,
            settings=settings,
        )
        logger.info(
            "完成 mode=%s phase=%s completed=%d failed=%d",
            checkpoint.mode,
            checkpoint.phase,
            checkpoint.completed_count,
            checkpoint.failed_count,
        )
        return 0 if checkpoint.phase == "done" else 1
    finally:
        hub.stop()
        loop.close()


if __name__ == "__main__":
    raise SystemExit(main())
