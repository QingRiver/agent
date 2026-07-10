from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

SymbolStatus = Literal["active", "suspended", "delisted", "not_listed"]


@dataclass
class SymbolMeta:
    last_bar_date: str = ""
    status: SymbolStatus = "active"
    list_date: str = ""
    suspend_since: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SymbolMeta:
        return cls(
            last_bar_date=data.get("last_bar_date", ""),
            status=data.get("status", "active"),
            list_date=data.get("list_date", ""),
            suspend_since=data.get("suspend_since", ""),
        )


@dataclass
class SyncMeta:
    version: int = 2
    last_success_trade_date: str = ""
    universe: list[str] = field(default_factory=list)
    symbols: dict[str, SymbolMeta] = field(default_factory=dict)
    updated_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "last_success_trade_date": self.last_success_trade_date,
            "universe": self.universe,
            "symbols": {k: v.to_dict() for k, v in self.symbols.items()},
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SyncMeta:
        symbols = {
            k: SymbolMeta.from_dict(v) if isinstance(v, dict) else v
            for k, v in data.get("symbols", {}).items()
        }
        return cls(
            version=data.get("version", 2),
            last_success_trade_date=data.get("last_success_trade_date", ""),
            universe=data.get("universe", []),
            symbols=symbols,
            updated_at=data.get("updated_at", ""),
        )

    def touch(self) -> None:
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def get_symbol(self, ts_code: str) -> SymbolMeta:
        return self.symbols.get(ts_code, SymbolMeta())

    def ensure_symbol(self, ts_code: str, *, list_date: str = "") -> SymbolMeta:
        entry = self.symbols.get(ts_code)
        if entry is None:
            entry = SymbolMeta(list_date=list_date)
            self.symbols[ts_code] = entry
        elif list_date and not entry.list_date:
            entry.list_date = list_date
        return entry


def load_sync_meta(path: Path) -> SyncMeta:
    if not path.exists():
        return SyncMeta()
    with path.open(encoding="utf-8") as f:
        return SyncMeta.from_dict(json.load(f))


def save_sync_meta(path: Path, meta: SyncMeta) -> None:
    meta.touch()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(meta.to_dict(), ensure_ascii=False, indent=2)
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
