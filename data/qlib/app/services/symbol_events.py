from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

EventType = Literal["traded", "suspended", "resumed", "no_bar", "not_listed", "backfill", "incremental"]


def append_symbol_event(
    path: Path,
    *,
    trade_date: str,
    ts_code: str,
    event: EventType,
    reason: str = "",
    extra: Optional[dict[str, Any]] = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "trade_date": trade_date,
        "ts_code": ts_code,
        "event": event,
        "reason": reason,
    }
    if extra:
        record.update(extra)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
