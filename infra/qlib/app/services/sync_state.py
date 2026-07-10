from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

Phase = Literal[
    "resolve_symbols",
    "fetch",
    "dump",
    "done",
    "resolve_trade_date",
    "fetch_section",
    "merge_csv",
]
SyncMode = Literal["backfill", "incremental"]


@dataclass
class FailedSymbol:
    attempts: int = 0
    error: str = ""


@dataclass
class SyncCheckpoint:
    version: int = 2
    mode: SyncMode = "backfill"
    phase: Phase = "resolve_symbols"
    trade_date: str = ""
    start_date: str = ""
    end_date: str = ""
    symbols_total: int = 0
    symbols: list[str] = field(default_factory=list)
    completed_symbols: list[str] = field(default_factory=list)
    failed_symbols: dict[str, FailedSymbol] = field(default_factory=dict)
    gap_trade_dates: list[str] = field(default_factory=list)
    completed_gap_dates: list[str] = field(default_factory=list)
    updated_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["failed_symbols"] = {
            k: asdict(v) if isinstance(v, FailedSymbol) else v
            for k, v in self.failed_symbols.items()
        }
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SyncCheckpoint:
        failed = {
            k: FailedSymbol(**v) if isinstance(v, dict) else v
            for k, v in data.get("failed_symbols", {}).items()
        }
        return cls(
            version=data.get("version", 2),
            mode=data.get("mode", "backfill"),
            phase=data.get("phase", "resolve_symbols"),
            trade_date=data.get("trade_date", ""),
            start_date=data.get("start_date", ""),
            end_date=data.get("end_date", ""),
            symbols_total=data.get("symbols_total", 0),
            symbols=data.get("symbols", []),
            completed_symbols=data.get("completed_symbols", []),
            failed_symbols=failed,
            gap_trade_dates=data.get("gap_trade_dates", []),
            completed_gap_dates=data.get("completed_gap_dates", []),
            updated_at=data.get("updated_at", ""),
        )

    def touch(self) -> None:
        self.updated_at = datetime.now(timezone.utc).isoformat()

    @property
    def completed_count(self) -> int:
        if self.mode == "incremental" and self.gap_trade_dates:
            return len(self.completed_gap_dates)
        return len(self.completed_symbols)

    @property
    def failed_count(self) -> int:
        return len(self.failed_symbols)

    @property
    def progress_pct(self) -> float:
        if self.mode == "incremental" and self.gap_trade_dates:
            total = len(self.gap_trade_dates)
            if total <= 0:
                return 0.0
            return round(len(self.completed_gap_dates) / total * 100, 2)
        if self.symbols_total <= 0:
            return 0.0
        return round(self.completed_count / self.symbols_total * 100, 2)


def load_checkpoint(path: Path) -> Optional[SyncCheckpoint]:
    if not path.exists():
        return None
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    return SyncCheckpoint.from_dict(data)


def save_checkpoint(path: Path, checkpoint: SyncCheckpoint) -> None:
    checkpoint.touch()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(checkpoint.to_dict(), ensure_ascii=False, indent=2)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
