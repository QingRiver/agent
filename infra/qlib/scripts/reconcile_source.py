#!/usr/bin/env python3
"""从 CSV 扫描/bootstrap sync_meta，可选写入 data_manifest.json。"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import get_settings
from app.services.source_bundle import prepare_bundle_for_reconcile, validate_bundle


def main() -> int:
    parser = argparse.ArgumentParser(description="从 CSV reconcile sync_meta")
    parser.add_argument("--write-manifest", action="store_true", help="写入 data_manifest.json")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)
    settings = get_settings()
    settings.ensure_dirs()
    prepare_bundle_for_reconcile(settings, write_manifest=args.write_manifest)
    for warning in validate_bundle(settings):
        logging.warning("bundle 校验: %s", warning)
    logging.info("reconcile 完成")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
