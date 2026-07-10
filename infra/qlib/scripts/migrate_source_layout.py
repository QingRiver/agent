#!/usr/bin/env python3
"""一次性迁移：state/ -> source/_runtime/，sync_meta.json -> source/ 根目录。"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import Settings, get_settings


def resolve_local_paths(settings: Settings) -> tuple[Path, Path]:
    """本地开发时 /app/source 不存在，回退到 infra/qlib/source。"""
    source_root = settings.source_root
    if str(source_root).startswith("/app") and not source_root.parent.exists():
        source_root = ROOT / "source"
    elif not source_root.is_absolute():
        source_root = ROOT / source_root
    legacy_state = ROOT / "state"
    return source_root, legacy_state


def _move_if_exists(src: Path, dst: Path) -> bool:
    if not src.exists():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        print(f"跳过（目标已存在）: {dst}")
        return False
    shutil.move(str(src), str(dst))
    print(f"已移动: {src} -> {dst}")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="迁移 state/ 到 source/ 新布局")
    parser.add_argument("--dry-run", action="store_true", help="仅打印计划，不执行")
    args = parser.parse_args()

    settings = get_settings()
    source_root, legacy_state = resolve_local_paths(settings)
    runtime_dir = source_root / "_runtime"

    moves = [
        (legacy_state / "sync_meta.json", source_root / "sync_meta.json"),
        (legacy_state / "sync_checkpoint.json", runtime_dir / "sync_checkpoint.json"),
        (legacy_state / "symbol_events.jsonl", runtime_dir / "symbol_events.jsonl"),
    ]

    print(f"source 根目录: {source_root}")
    for src, dst in moves:
        if args.dry_run:
            if src.exists():
                print(f"[dry-run] {src} -> {dst}")
            continue
        _move_if_exists(src, dst)

    if not args.dry_run and legacy_state.exists() and not any(legacy_state.iterdir()):
        legacy_state.rmdir()
        print(f"已删除空目录: {legacy_state}")

    if not args.dry_run:
        print("\n请运行 reconcile_source.py --write-manifest 生成索引与 manifest")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
