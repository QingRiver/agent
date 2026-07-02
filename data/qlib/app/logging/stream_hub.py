from __future__ import annotations

import asyncio
import json
import logging
import queue
import threading
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime, timezone
from logging.handlers import QueueHandler, QueueListener
from typing import Any

LOG_LEVELS = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}


@dataclass
class LogEvent:
    ts: str
    level: str
    logger: str
    message: str

    def to_json(self) -> str:
        return json.dumps(
            {
                "ts": self.ts,
                "level": self.level,
                "logger": self.logger,
                "message": self.message,
            },
            ensure_ascii=False,
        )


class StreamBroadcastHandler(logging.Handler):
    def __init__(self, hub: LogStreamHub) -> None:
        super().__init__()
        self._hub = hub

    def emit(self, record: logging.LogRecord) -> None:
        try:
            event = LogEvent(
                ts=datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
                level=record.levelname,
                logger=record.name,
                message=self.format(record),
            )
            self._hub.publish(event)
        except Exception:
            self.handleError(record)


class LogStreamHub:
    def __init__(self) -> None:
        self._log_queue: queue.Queue[logging.LogRecord] = queue.Queue(-1)
        self._subscribers: set[asyncio.Queue[LogEvent]] = set()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._listener: Optional[QueueListener] = None
        self._queue_handler: Optional[QueueHandler] = None
        self._lock = threading.Lock()
        self._started = False

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        if self._started:
            return
        self._loop = loop
        broadcast = StreamBroadcastHandler(self)
        broadcast.setFormatter(
            logging.Formatter("[%(asctime)s] %(levelname)s - %(name)s - %(message)s")
        )
        self._listener = QueueListener(self._log_queue, broadcast, respect_handler_level=True)
        self._listener.start()

        self._queue_handler = QueueHandler(self._log_queue)
        root = logging.getLogger()
        root.setLevel(logging.DEBUG)
        if self._queue_handler not in root.handlers:
            root.addHandler(self._queue_handler)

        qlib_logger = logging.getLogger("qlib")
        qlib_logger.setLevel(logging.DEBUG)
        qlib_logger.propagate = True

        service_logger = logging.getLogger("qlib_service")
        service_logger.setLevel(logging.DEBUG)
        service_logger.propagate = True

        self._started = True

    def stop(self) -> None:
        if self._listener is not None:
            self._listener.stop()
            self._listener = None
        self._started = False

    def publish(self, event: LogEvent) -> None:
        if self._loop is None or not self._loop.is_running():
            return
        with self._lock:
            subscribers = list(self._subscribers)
        for sub in subscribers:
            self._loop.call_soon_threadsafe(self._put_nowait_safe, sub, event)

    @staticmethod
    def _put_nowait_safe(sub: asyncio.Queue[LogEvent], event: LogEvent) -> None:
        try:
            sub.put_nowait(event)
        except asyncio.QueueFull:
            pass

    def subscribe(self) -> asyncio.Queue[LogEvent]:
        if self._loop is None:
            raise RuntimeError("LogStreamHub not started")
        sub: asyncio.Queue[LogEvent] = asyncio.Queue(maxsize=1000)
        with self._lock:
            self._subscribers.add(sub)
        return sub

    def unsubscribe(self, sub: asyncio.Queue[LogEvent]) -> None:
        with self._lock:
            self._subscribers.discard(sub)

    async def stream_events(
        self,
        *,
        min_level: int = logging.INFO,
    ) -> AsyncIterator[LogEvent]:
        sub = self.subscribe()
        try:
            while True:
                event = await sub.get()
                if LOG_LEVELS.get(event.level, logging.INFO) >= min_level:
                    yield event
        finally:
            self.unsubscribe(sub)


_hub: Optional[LogStreamHub] = None


def get_log_hub() -> LogStreamHub:
    global _hub
    if _hub is None:
        _hub = LogStreamHub()
    return _hub


def get_service_logger(name: str = "qlib_service") -> logging.Logger:
    return logging.getLogger(name)
