from __future__ import annotations

import re
import time
from typing import Any, Optional

import httpx

from app.config import Settings, get_settings
from app.services.rate_limiter import AdaptiveRateLimiter

TUSHARE_API = "https://api.tushare.pro"

RETRYABLE_PATTERNS = [
    re.compile(r"timeout", re.I),
    re.compile(r"timed out", re.I),
    re.compile(r"connection", re.I),
    re.compile(r"频率", re.I),
    re.compile(r"限流", re.I),
    re.compile(r"too many", re.I),
    re.compile(r"429", re.I),
    re.compile(r"503", re.I),
    re.compile(r"502", re.I),
]

NON_RETRYABLE_PATTERNS = [
    re.compile(r"token", re.I),
    re.compile(r"权限", re.I),
    re.compile(r"积分", re.I),
    re.compile(r"没有接口访问权限", re.I),
]


class TushareError(Exception):
    def __init__(self, message: str, *, retryable: bool = False, code: Optional[int] = None) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.code = code


def _should_bump_interval(exc: TushareError) -> bool:
    message = str(exc)
    if re.search(r"timeout|timed out|超时", message, re.I):
        return True
    if exc.code in {429, 502, 503, 504}:
        return True
    return bool(re.search(r"频率|限流|too many", message, re.I))


def _is_retryable(message: str, code: Optional[int] = None) -> bool:
    for pattern in NON_RETRYABLE_PATTERNS:
        if pattern.search(message):
            return False
    if code in {429, 502, 503, 504}:
        return True
    return any(pattern.search(message) for pattern in RETRYABLE_PATTERNS)


class TushareClient:
    def __init__(self, settings: Optional[Settings] = None) -> None:
        self.settings = settings or get_settings()
        if not self.settings.tushare_token:
            raise TushareError("请在环境变量设置 TUSHARE_TOKEN", retryable=False)
        self._limiter = AdaptiveRateLimiter(
            self.settings.tushare_request_interval_sec,
            self.settings.tushare_request_interval_step_sec,
            self.settings.tushare_request_interval_max_sec,
        )

    def call(
        self,
        api_name: str,
        params: Optional[dict[str, Any]] = None,
        fields: str = "",
    ) -> list[dict[str, Any]]:
        params = params or {}
        last_error: Optional[Exception] = None

        for attempt in range(self.settings.max_retries):
            try:
                rows = self._request(api_name, params, fields)
                self._limiter.on_success()
                return rows
            except TushareError as exc:
                last_error = exc
                if _should_bump_interval(exc):
                    self._limiter.on_throttle()
                if not exc.retryable or attempt >= self.settings.max_retries - 1:
                    raise
                delay = self.settings.retry_base_delay_sec * (2 ** attempt)
                time.sleep(delay)

        raise last_error or TushareError(f"Tushare 调用失败: {api_name}")

    def _request(
        self,
        api_name: str,
        params: dict[str, Any],
        fields: str,
    ) -> list[dict[str, Any]]:
        self._limiter.acquire()
        body = {
            "api_name": api_name,
            "token": self.settings.tushare_token,
            "params": params,
            "fields": fields,
        }
        try:
            with httpx.Client(timeout=self.settings.tushare_timeout_sec) as client:
                response = client.post(TUSHARE_API, json=body)
        except httpx.TimeoutException as exc:
            raise TushareError(f"Tushare 请求超时: {api_name}", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise TushareError(f"Tushare 网络错误: {exc}", retryable=True) from exc

        if response.status_code >= 500:
            raise TushareError(
                f"Tushare HTTP 错误: {response.status_code}",
                retryable=True,
                code=response.status_code,
            )
        if not response.is_success:
            raise TushareError(
                f"Tushare HTTP 错误: {response.status_code}",
                retryable=response.status_code == 429,
                code=response.status_code,
            )

        payload = response.json()
        code = payload.get("code")
        msg = payload.get("msg") or f"Tushare 业务错误 code={code}"
        if code != 0:
            raise TushareError(msg, retryable=_is_retryable(msg, code), code=code)

        data = payload.get("data")
        if not data or not data.get("items"):
            return []

        field_names = data["fields"]
        rows: list[dict[str, Any]] = []
        for item in data["items"]:
            row = {field_names[i]: item[i] for i in range(len(field_names))}
            rows.append(row)
        return rows
