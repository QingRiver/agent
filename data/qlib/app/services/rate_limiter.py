from __future__ import annotations

import threading
import time


class AdaptiveRateLimiter:
    """Adaptive interval between Tushare calls: base on success, +step on throttle, capped at max."""

    def __init__(self, base_sec: float, step_sec: float, max_sec: float) -> None:
        if base_sec <= 0 or step_sec <= 0 or max_sec <= 0:
            raise ValueError("interval seconds must be positive")
        if base_sec > max_sec:
            raise ValueError("base_sec must not exceed max_sec")
        self._base = base_sec
        self._step = step_sec
        self._max = max_sec
        self._current = base_sec
        self._lock = threading.Lock()
        self._last_request_at = 0.0

    @property
    def current_interval(self) -> float:
        with self._lock:
            return self._current

    def acquire(self) -> None:
        with self._lock:
            interval = self._current
            now = time.monotonic()
            wait = interval - (now - self._last_request_at)
            if wait > 0:
                time.sleep(wait)
            self._last_request_at = time.monotonic()

    def on_success(self) -> None:
        with self._lock:
            self._current = self._base

    def on_throttle(self) -> None:
        with self._lock:
            self._current = min(self._current + self._step, self._max)
