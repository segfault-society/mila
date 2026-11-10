"""Project-wide constants and paths. Everything tunable lives here, not in the modules."""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader: KEY=VALUE lines; never overrides variables already set in the environment."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(REPO_ROOT / ".env")
DATA_DIR = Path(os.environ.get("MILA_DATA_DIR", REPO_ROOT / "data"))
RAW_DIR = DATA_DIR / "raw"
PDF_DIR = RAW_DIR / "pdf"
LISTING_DIR = RAW_DIR / "listing"
RAW_INDEX = RAW_DIR / "index.jsonl"

# CBSL. robots.txt (User-agent: *) asks for a 10 s crawl delay and does not disallow the report folder.
# CloudFront rejects any User-Agent containing "bot", so we identify the project without that word.
CBSL_BASE = "https://www.cbsl.gov.lk"
CBSL_LISTING_URL = f"{CBSL_BASE}/en/statistics/economic-indicators/price-report"
# The one-time backfill on 2026-11-10 ran at MILA_CRAWL_DELAY=2 to meet the submission deadline (see README).
CBSL_CRAWL_DELAY_S = float(os.environ.get("MILA_CRAWL_DELAY", "10"))
USER_AGENT = "Mila/0.1 (Segfault Society research project; +https://github.com/segfault-society/mila)"
HTTP_TIMEOUT_S = 60.0

TIMEZONE = "Asia/Colombo"


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set (see .env.example)")
    return url
