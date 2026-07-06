"""Tests for daily dump planning."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
for path in (ROOT, SCRIPTS):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from app.config import Settings
from app.services.sync_meta import SyncMeta, save_sync_meta
from dump_daily import (
    _collect_new_calendar_dates,
    _needs_bin_update,
    _qlib_symbol_to_ts_code,
    plan_daily_dump,
)


def _write_csv(bars_dir: Path, ts_code: str, dates: list[str]) -> None:
    bars_dir.mkdir(parents=True, exist_ok=True)
    fname = ts_code.replace(".", "_").lower() + ".csv"
    df = pd.DataFrame(
        {
            "date": dates,
            "open": [1.0] * len(dates),
            "high": [1.0] * len(dates),
            "low": [1.0] * len(dates),
            "close": [1.0] * len(dates),
            "volume": [100] * len(dates),
            "factor": [1.0] * len(dates),
        }
    )
    df.to_csv(bars_dir / fname, index=False)


class TestDumpDaily(unittest.TestCase):
    def _settings(self, root: Path) -> Settings:
        return Settings.model_construct(
            qlib_source_dir=str(root / "source"),
            qlib_data_dir=str(root / "qlib_data/cn_data"),
            bars_subdir="cn_1d",
            runtime_subdir="_runtime",
        )

    def test_needs_bin_update_strict_gt(self) -> None:
        self.assertTrue(_needs_bin_update("20260702", "20260701"))
        self.assertFalse(_needs_bin_update("20260702", "20260702"))
        self.assertFalse(_needs_bin_update("20260702", "2026-07-02"))

    def test_qlib_symbol_to_ts_code(self) -> None:
        self.assertEqual(_qlib_symbol_to_ts_code("000001_SZ"), "000001.SZ")
        self.assertEqual(_qlib_symbol_to_ts_code("600000.SH"), "600000.SH")

    def test_plan_skip_with_qlib_instrument_keys(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            settings = self._settings(root)
            settings.ensure_dirs()
            _write_csv(settings.bars_dir, "000001.SZ", ["20260701", "20260702", "20260703"])

            cal_dir = Path(settings.qlib_data_dir) / "calendars"
            cal_dir.mkdir(parents=True)
            (cal_dir / "day.txt").write_text("2026-07-01\n2026-07-02\n2026-07-03\n", encoding="utf-8")

            inst_dir = Path(settings.qlib_data_dir) / "instruments"
            inst_dir.mkdir(parents=True, exist_ok=True)
            (inst_dir / "all.txt").write_text("000001_SZ\t2026-01-01\t2026-07-03\n", encoding="utf-8")

            save_sync_meta(settings.sync_meta_path, SyncMeta(last_success_trade_date="20260703"))
            (settings.runtime_dir / "symbol_index.json").write_text(
                json.dumps(
                    {
                        "symbols": {
                            "000001.SZ": {"first_date": "20260701", "last_date": "20260703", "row_count": 3},
                        },
                        "updated_at": "2026-07-03T00:00:00+00:00",
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            plan = plan_daily_dump(settings)
            self.assertEqual(plan.mode, "skip")
            self.assertEqual(plan.dirty_symbol_count, 0)

    def test_collect_new_calendar_dates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            bars = Path(tmp)
            _write_csv(bars, "000001.SZ", ["20260701", "20260702", "20260703"])
            dates = _collect_new_calendar_dates(bars, "20260630", "20260702")
            self.assertEqual(dates, ["2026-07-01", "2026-07-02"])

    def test_plan_partial_when_calendar_and_symbols_behind(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            settings = self._settings(root)
            settings.ensure_dirs()
            _write_csv(settings.bars_dir, "000001.SZ", ["20260701", "20260702"])
            _write_csv(settings.bars_dir, "000002.SZ", ["20260701", "20260702"])

            cal_dir = Path(settings.qlib_data_dir) / "calendars"
            cal_dir.mkdir(parents=True)
            (cal_dir / "day.txt").write_text("2026-06-30\n2026-07-01\n", encoding="utf-8")

            inst_dir = Path(settings.qlib_data_dir) / "instruments"
            inst_dir.mkdir(parents=True, exist_ok=True)
            (inst_dir / "all.txt").write_text("000001_SZ\t2026-01-01\t2026-07-01\n000002_SZ\t2026-01-01\t2026-07-01\n", encoding="utf-8")

            meta = SyncMeta(last_success_trade_date="20260702")
            save_sync_meta(settings.sync_meta_path, meta)
            (settings.runtime_dir / "symbol_index.json").write_text(
                json.dumps(
                    {
                        "symbols": {
                            "000001.SZ": {"first_date": "20260701", "last_date": "20260702", "row_count": 2},
                            "000002.SZ": {"first_date": "20260701", "last_date": "20260702", "row_count": 2},
                        },
                        "updated_at": "2026-07-03T00:00:00+00:00",
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            plan = plan_daily_dump(settings)
            self.assertEqual(plan.mode, "partial")
            self.assertEqual(plan.append_calendar, ["2026-07-02"])
            self.assertEqual(sorted(plan.only_files or []), ["000001_sz", "000002_sz"])

    def test_plan_skip_when_bin_aligned(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            settings = self._settings(root)
            settings.ensure_dirs()
            _write_csv(settings.bars_dir, "000001.SZ", ["20260701", "20260702"])

            cal_dir = Path(settings.qlib_data_dir) / "calendars"
            cal_dir.mkdir(parents=True)
            (cal_dir / "day.txt").write_text("2026-07-01\n2026-07-02\n", encoding="utf-8")

            inst_dir = Path(settings.qlib_data_dir) / "instruments"
            inst_dir.mkdir(parents=True, exist_ok=True)
            (inst_dir / "all.txt").write_text("000001.SZ\t2026-01-01\t2026-07-02\n", encoding="utf-8")

            save_sync_meta(settings.sync_meta_path, SyncMeta(last_success_trade_date="20260702"))
            (settings.runtime_dir / "symbol_index.json").write_text(
                json.dumps(
                    {
                        "symbols": {
                            "000001.SZ": {"first_date": "20260701", "last_date": "20260702", "row_count": 2},
                        },
                        "updated_at": "2026-07-03T00:00:00+00:00",
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            plan = plan_daily_dump(settings)
            self.assertEqual(plan.mode, "skip")
            self.assertEqual(plan.dirty_symbol_count, 0)

    def test_plan_calendar_only_when_bins_aligned(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            settings = self._settings(root)
            settings.ensure_dirs()
            _write_csv(settings.bars_dir, "000001.SZ", ["20260701", "20260702", "20260703"])

            cal_dir = Path(settings.qlib_data_dir) / "calendars"
            cal_dir.mkdir(parents=True)
            (cal_dir / "day.txt").write_text("2026-07-01\n2026-07-02\n", encoding="utf-8")

            inst_dir = Path(settings.qlib_data_dir) / "instruments"
            inst_dir.mkdir(parents=True, exist_ok=True)
            (inst_dir / "all.txt").write_text("000001_SZ\t2026-01-01\t2026-07-03\n", encoding="utf-8")

            save_sync_meta(settings.sync_meta_path, SyncMeta(last_success_trade_date="20260703"))
            (settings.runtime_dir / "symbol_index.json").write_text(
                json.dumps(
                    {
                        "symbols": {
                            "000001.SZ": {"first_date": "20260701", "last_date": "20260703", "row_count": 3},
                        },
                        "updated_at": "2026-07-03T00:00:00+00:00",
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            plan = plan_daily_dump(settings)
            self.assertEqual(plan.mode, "calendar_only")
            self.assertEqual(plan.append_calendar, ["2026-07-03"])
            self.assertEqual(plan.dirty_symbol_count, 0)


if __name__ == "__main__":
    unittest.main()
