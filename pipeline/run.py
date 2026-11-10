"""Entry point for the Trigger.dev Python extension: `python pipeline/run.py <mila command> ...`."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from mila.cli import app  # noqa: E402

if __name__ == "__main__":
    app()
