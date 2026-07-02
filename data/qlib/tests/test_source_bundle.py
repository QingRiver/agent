"""Tests for source bundle bootstrap, reconcile, and backfill guards."""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import Settings
from app.services.source_bundle import (
    BACKFILL_GUARD_MIN_SYMBOLS,
    backfill_guard_blocks,
    bootstrap_from_csv,
    conservative_watermark,
    filter_pending_dates_already_in_snapshot,
    needs_bootstrap,
    reconcile_meta,
    scan_symbol_index,
    snapshot_watermark,
    symbol_covers_range,
    SymbolIndex,
    SymbolIndexEntry,
)
from app.services.sync_meta import SyncMeta, SymbolMeta


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


class TestSourceBundle(unittest.TestCase):
    def setUp(self) -> None:
        self._env_source = os.environ.pop("QLIB_SOURCE_DIR", None)

    def tearDown(self) -> None:
        if self._env_source is not None:
            os.environ["QLIB_SOURCE_DIR"] = self._env_source

    def _settings(self, root: Path) -> Settings:
        return Settings.model_construct(
            qlib_source_dir=str(root),
            qlib_data_dir=str(root / "qlib_data"),
            bars_subdir="cn_1d",
            runtime_subdir="_runtime",
        )

    def test_needs_bootstrap_when_csv_without_meta(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            settings = self._settings(root)
            settings.ensure_dirs()
            _write_csv(settings.bars_dir, "000001.SZ", ["20260101", "20260102"])
            meta = SyncMeta()
            self.assertTrue(needs_bootstrap(meta, settings.bars_dir, settings.sync_meta_path))

    def test_bootstrap_snapshot_watermark_is_max(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            settings = self._settings(root)
            settings.ensure_dirs()
            _write_csv(settings.bars_dir, "000001.SZ", ["20260101", "20260105"])
            _write_csv(settings.bars_dir, "000002.SZ", ["20260101", "20260103"])
            meta, index = bootstrap_from_csv(settings)
            self.assertEqual(meta.last_success_trade_date, "20260105")
            self.assertEqual(conservative_watermark(meta), "20260103")
            self.assertEqual(snapshot_watermark(meta), "20260105")
            self.assertEqual(meta.get_symbol("000001.SZ").last_bar_date, "20260105")
            self.assertEqual(meta.get_symbol("000002.SZ").last_bar_date, "20260103")
            self.assertTrue(settings.sync_meta_path.exists())
            self.assertTrue(settings.symbol_index_path.exists())
            self.assertEqual(len(index.symbols), 2)

    def test_filter_pending_dates_already_in_snapshot(self) -> None:
        index = SymbolIndex(
            symbols={
                "000001.SZ": SymbolIndexEntry(first_date="20260101", last_date="20260110", row_count=10),
            }
        )
        pending = ["20260108", "20260109", "20260110", "20260111", "20260112"]
        filtered = filter_pending_dates_already_in_snapshot(pending, index)
        self.assertEqual(filtered, ["20260111", "20260112"])

    def test_reconcile_lowers_stale_meta_watermark(self) -> None:
        meta = SyncMeta(last_success_trade_date="20260110")
        meta.symbols["000001.SZ"] = SymbolMeta(last_bar_date="20260110")
        index = SymbolIndex(
            symbols={
                "000001.SZ": SymbolIndexEntry(first_date="20260101", last_date="20260105", row_count=5),
            }
        )
        reconciled = reconcile_meta(meta, index)
        self.assertEqual(reconciled.last_success_trade_date, "20260105")
        self.assertEqual(reconciled.get_symbol("000001.SZ").last_bar_date, "20260105")

    def test_symbol_covers_range(self) -> None:
        index = SymbolIndex(
            symbols={
                "000001.SZ": SymbolIndexEntry(first_date="20260101", last_date="20260110", row_count=10),
            }
        )
        self.assertTrue(symbol_covers_range(index, "000001.SZ", "20260101", "20260110"))
        self.assertFalse(symbol_covers_range(index, "000001.SZ", "20251201", "20260110"))
        self.assertFalse(symbol_covers_range(index, "000001.SZ", "20260101", "20260115"))

    def test_backfill_guard_blocks_with_data(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            settings = self._settings(root)
            settings.ensure_dirs()
            for i in range(BACKFILL_GUARD_MIN_SYMBOLS):
                code = f"{i:06d}.SZ"
                _write_csv(settings.bars_dir, code, ["20260101"])
            meta = SyncMeta(last_success_trade_date="20260101")
            settings.sync_meta_path.write_text(
                json.dumps(meta.to_dict(), ensure_ascii=False),
                encoding="utf-8",
            )
            msg = backfill_guard_blocks(settings, force=False, symbols_filter=None)
            self.assertIsNotNone(msg)
            self.assertIn("incremental", msg or "")

    def test_backfill_guard_allows_force(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            settings = self._settings(root)
            settings.ensure_dirs()
            for i in range(BACKFILL_GUARD_MIN_SYMBOLS):
                _write_csv(settings.bars_dir, f"{i:06d}.SZ", ["20260101"])
            SyncMeta(last_success_trade_date="20260101")
            settings.sync_meta_path.write_text("{}", encoding="utf-8")
            self.assertIsNone(backfill_guard_blocks(settings, force=True, symbols_filter=None))

    def test_settings_paths(self) -> None:
        settings = Settings(qlib_source_dir="/app/source")
        self.assertEqual(settings.bars_dir, Path("/app/source/cn_1d"))
        self.assertEqual(settings.runtime_dir, Path("/app/source/_runtime"))
        self.assertEqual(settings.sync_meta_path, Path("/app/source/sync_meta.json"))
        self.assertEqual(settings.checkpoint_path, Path("/app/source/_runtime/sync_checkpoint.json"))


if __name__ == "__main__":
    unittest.main()
