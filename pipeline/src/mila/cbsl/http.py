"""A polite HTTP client for cbsl.gov.lk: one request at a time, at least CRAWL_DELAY apart, with retries."""

from __future__ import annotations

import time

import httpx

from mila.config import CBSL_CRAWL_DELAY_S, HTTP_TIMEOUT_S, USER_AGENT


class BlockedError(RuntimeError):
    """The site refused us (403/429). We stop rather than retry harder."""


class PoliteClient:
    def __init__(self, delay_s: float = CBSL_CRAWL_DELAY_S, max_retries: int = 3,
                 sleep=time.sleep, clock=time.monotonic):
        self.delay_s = delay_s
        self.max_retries = max_retries
        self._sleep = sleep
        self._clock = clock
        self._last: float | None = None
        self._http = httpx.Client(
            headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
            timeout=HTTP_TIMEOUT_S,
            follow_redirects=True,
        )

    def _wait_turn(self) -> None:
        if self._last is not None:
            remaining = self.delay_s - (self._clock() - self._last)
            if remaining > 0:
                self._sleep(remaining)
        self._last = self._clock()

    def get(self, url: str) -> httpx.Response:
        """GET with the crawl delay enforced before every attempt, including retries."""
        last_exc: Exception | None = None
        for attempt in range(self.max_retries + 1):
            self._wait_turn()
            try:
                resp = self._http.get(url)
            except httpx.TransportError as exc:
                last_exc = exc
                self._sleep(min(60.0, 5.0 * 2**attempt))
                continue
            if resp.status_code in (403, 429):
                raise BlockedError(f"{resp.status_code} from {url}")
            if resp.status_code >= 500:
                last_exc = httpx.HTTPStatusError(f"{resp.status_code}", request=resp.request, response=resp)
                self._sleep(min(60.0, 5.0 * 2**attempt))
                continue
            return resp
        raise RuntimeError(f"giving up on {url}: {last_exc}")

    def close(self) -> None:
        self._http.close()
