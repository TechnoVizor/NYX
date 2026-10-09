"""Client for nyx-runner, the only service allowed to start containers."""

from collections.abc import Iterator

import httpx

from app.config import settings


class RunnerError(Exception):
    pass


class RunnerClient:
    def __init__(self, url: str, token: str):
        self.url = url.rstrip("/")
        self.headers = {"authorization": f"Bearer {token}"}

    def digest(self, image: str) -> str | None:
        try:
            r = httpx.get(f"{self.url}/v1/images/{image}", headers=self.headers, timeout=10)
        except httpx.HTTPError:
            return None
        return r.json()["digest"] if r.status_code == 200 else None

    def cancel(self, run_id: str) -> None:
        """Kill the run's container if it is still there. Best effort: callers move on either way."""
        try:
            httpx.delete(f"{self.url}/v1/runs/{run_id}", headers=self.headers, timeout=10)
        except httpx.HTTPError:
            pass

    def run(self, body: dict) -> Iterator[str]:
        timeout = httpx.Timeout(10, read=body["resources"]["timeout_seconds"] + 30)
        try:
            with httpx.stream("POST", f"{self.url}/v1/runs", json=body, headers=self.headers, timeout=timeout) as r:
                if r.status_code != 200:
                    raise RunnerError(f"Runner refused the run ({r.status_code}).")
                yield from r.iter_lines()
        except httpx.HTTPError:
            raise RunnerError("Runner unreachable.") from None


def get_runner() -> RunnerClient:
    return RunnerClient(settings.runner_url, settings.runner_token)
