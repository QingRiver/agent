from __future__ import annotations

import os
import sys
from pathlib import Path

QLIB_ROOT = Path(__file__).resolve().parents[1]


def _detect_repo_root() -> Path:
    env = os.getenv("REPO_ROOT")
    if env:
        return Path(env)
    for parent in QLIB_ROOT.parents:
        if (parent / "package.json").exists():
            return parent
    return QLIB_ROOT.parent


REPO_ROOT = _detect_repo_root()
LOCAL_REPORT_DIR = Path(os.getenv("LOCAL_REPORT_DIR", str(REPO_ROOT / "local_report")))

if str(QLIB_ROOT) not in sys.path:
    sys.path.insert(0, str(QLIB_ROOT))


def resolve_bars_dir(settings, arg: str | None = None) -> Path:
    if arg:
        path = Path(arg)
        return path if path.is_absolute() else REPO_ROOT / path

    local = QLIB_ROOT / "source" / "cn_1d"
    if local.exists():
        return local

    bars = settings.bars_dir
    if bars.is_absolute() and bars.exists():
        return bars

    candidate = REPO_ROOT / bars
    if candidate.exists():
        return candidate

    return local


def resolve_qlib_data_dir(settings) -> Path:
    local = QLIB_ROOT / "qlib_data" / "cn_data"
    if local.exists():
        return local

    data_dir = Path(settings.qlib_data_dir)
    if data_dir.is_absolute() and data_dir.exists():
        return data_dir

    candidate = REPO_ROOT / data_dir
    if candidate.exists():
        return candidate

    return local
