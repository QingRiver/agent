from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _monorepo_root() -> Optional[Path]:
    here = Path(__file__).resolve()
    if len(here.parents) <= 3:
        return None
    root = here.parents[3]
    return root if (root / "package.json").exists() else None


def _env_file_paths() -> tuple[str, ...]:
    root = _monorepo_root()
    if root is None:
        return ()
    paths = [root / ".env", root / "data" / "qlib" / ".env"]
    return tuple(str(p) for p in paths if p.exists())


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        extra="ignore",
    )

    tushare_token: str = Field(default="", validation_alias="TUSHARE_TOKEN")
    tushare_request_interval_sec: float = Field(
        default=5.0,
        validation_alias="TUSHARE_REQUEST_INTERVAL_SEC",
    )
    tushare_request_interval_step_sec: float = Field(
        default=5.0,
        validation_alias="TUSHARE_REQUEST_INTERVAL_STEP_SEC",
    )
    tushare_request_interval_max_sec: float = Field(
        default=20.0,
        validation_alias="TUSHARE_REQUEST_INTERVAL_MAX_SEC",
    )
    qlib_api_port: int = Field(default=8000, validation_alias="QLIB_API_PORT")
    qlib_data_dir: str = Field(default="data/qlib/qlib_data/cn_data", validation_alias="QLIB_DATA_DIR")
    qlib_source_dir: str = Field(default="/app/source", validation_alias="QLIB_SOURCE_DIR")
    qlib_config_dir: str = Field(default="/app/config", validation_alias="QLIB_CONFIG_DIR")

    max_retries: int = 5
    retry_base_delay_sec: float = 1.0
    tushare_timeout_sec: float = 30.0
    lookback_days: int = 365
    max_failed_attempts: int = 5

    bars_subdir: str = "cn_1d"
    runtime_subdir: str = "_runtime"

    @property
    def source_root(self) -> Path:
        return Path(self.qlib_source_dir)

    @property
    def bars_dir(self) -> Path:
        return self.source_root / self.bars_subdir

    @property
    def runtime_dir(self) -> Path:
        return self.source_root / self.runtime_subdir

    @property
    def sync_meta_path(self) -> Path:
        return self.source_root / "sync_meta.json"

    @property
    def data_manifest_path(self) -> Path:
        return self.source_root / "data_manifest.json"

    @property
    def symbol_events_path(self) -> Path:
        return self.runtime_dir / "symbol_events.jsonl"

    @property
    def checkpoint_path(self) -> Path:
        return self.runtime_dir / "sync_checkpoint.json"

    @property
    def symbol_index_path(self) -> Path:
        return self.runtime_dir / "symbol_index.json"

    @property
    def instruments_path(self) -> Path:
        return Path(self.qlib_data_dir) / "instruments" / "all.txt"

    def ensure_dirs(self) -> None:
        Path(self.qlib_data_dir).mkdir(parents=True, exist_ok=True)
        self.source_root.mkdir(parents=True, exist_ok=True)
        self.bars_dir.mkdir(parents=True, exist_ok=True)
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self.instruments_path.parent.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    env_files = _env_file_paths()
    settings = Settings(_env_file=env_files or None)
    yaml_path = Path(settings.qlib_config_dir) / "settings.yaml"
    yaml_cfg = _load_yaml(yaml_path)

    tushare_cfg = yaml_cfg.get("tushare", {})
    sync_cfg = yaml_cfg.get("sync", {})
    qlib_cfg = yaml_cfg.get("qlib", {})

    if "data_dir" in qlib_cfg and not os.getenv("QLIB_DATA_DIR"):
        settings.qlib_data_dir = qlib_cfg["data_dir"]
    if "source_dir" in qlib_cfg and not os.getenv("QLIB_SOURCE_DIR"):
        settings.qlib_source_dir = qlib_cfg["source_dir"]
    if "bars_subdir" in qlib_cfg and not os.getenv("QLIB_BARS_SUBDIR"):
        settings.bars_subdir = qlib_cfg["bars_subdir"]
    if "runtime_subdir" in qlib_cfg and not os.getenv("QLIB_RUNTIME_SUBDIR"):
        settings.runtime_subdir = qlib_cfg["runtime_subdir"]

    if not os.getenv("TUSHARE_REQUEST_INTERVAL_SEC") and "request_interval_sec" in tushare_cfg:
        settings.tushare_request_interval_sec = float(tushare_cfg["request_interval_sec"])
    if not os.getenv("TUSHARE_REQUEST_INTERVAL_STEP_SEC") and "request_interval_step_sec" in tushare_cfg:
        settings.tushare_request_interval_step_sec = float(tushare_cfg["request_interval_step_sec"])
    if not os.getenv("TUSHARE_REQUEST_INTERVAL_MAX_SEC") and "request_interval_max_sec" in tushare_cfg:
        settings.tushare_request_interval_max_sec = float(tushare_cfg["request_interval_max_sec"])
    if "max_retries" in tushare_cfg:
        settings.max_retries = int(tushare_cfg["max_retries"])
    if "retry_base_delay_sec" in tushare_cfg:
        settings.retry_base_delay_sec = float(tushare_cfg["retry_base_delay_sec"])
    if "timeout_sec" in tushare_cfg:
        settings.tushare_timeout_sec = float(tushare_cfg["timeout_sec"])

    if "lookback_days" in sync_cfg:
        settings.lookback_days = int(sync_cfg["lookback_days"])
    if "max_failed_attempts" in sync_cfg:
        settings.max_failed_attempts = int(sync_cfg["max_failed_attempts"])

    return settings
