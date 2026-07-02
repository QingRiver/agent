"""Tests for sync slot reservation (concurrent trigger guard)."""
from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services import qlib_runner


class TestSyncSlotReservation(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        await qlib_runner.release_sync_slot()

    async def asyncTearDown(self) -> None:
        await qlib_runner.release_sync_slot()

    async def test_reserve_blocks_second_caller(self) -> None:
        await qlib_runner.reserve_sync_slot()
        with self.assertRaises(qlib_runner.SyncSlotBusyError):
            await qlib_runner.reserve_sync_slot()

    async def test_release_allows_re_reserve(self) -> None:
        await qlib_runner.reserve_sync_slot()
        await qlib_runner.release_sync_slot()
        await qlib_runner.reserve_sync_slot()

    async def test_concurrent_reserve_only_one_succeeds(self) -> None:
        results: list[bool] = []

        async def try_reserve() -> None:
            try:
                await qlib_runner.reserve_sync_slot()
                results.append(True)
            except qlib_runner.SyncSlotBusyError:
                results.append(False)

        await asyncio.gather(try_reserve(), try_reserve())
        self.assertEqual(sum(results), 1)
        self.assertEqual(results.count(False), 1)


if __name__ == "__main__":
    unittest.main()
