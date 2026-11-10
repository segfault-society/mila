"""Golden values read off real reports (one per layout era). Skipped when the PDFs are not on disk."""
from pathlib import Path

import pytest

from mila.cbsl.parse import parse_pdf
from mila.config import PDF_DIR

GOLDEN = {
    # file: {(item, market, type): (comparison, today)}
    "price_report_20160801e.pdf": {("beans", "pettah", "wholesale"): (128.0, 140.0),
                                   ("beans", "dambulla", "retail"): (197.0, 165.0)},
    "price_report_20190425e.pdf": {("beans", "pettah", "wholesale"): (270.0, 260.0),
                                   ("beans", "dambulla", "retail"): (225.0, 195.0)},
    "price_report_20200430_e.pdf": {("beans", "pettah", "wholesale"): (65.0, 100.0),
                                    ("beans", "pettah", "retail"): (None, None)},
    "price_report_20220509e.pdf": {("beans", "narahenpita", "retail"): (None, 600.0)},
    "price_report_20261109_e.pdf": {("beans", "pettah", "wholesale"): (500.0, 600.0),
                                    ("lime", "narahenpita", "retail"): (1800.0, 2000.0),
                                    ("red_onion_imp", "dambulla", "wholesale"): (535.0, None),
                                    ("samba", "marandagahamula", "wholesale"): (228.0, 223.0)},
}


@pytest.mark.rawpdf
@pytest.mark.parametrize("name", sorted(GOLDEN))
def test_golden_values(name):
    path = PDF_DIR / name
    if not Path(path).exists():
        pytest.skip(f"{name} not downloaded")
    got = {(o.item_key, o.market, o.price_type): (o.comparison, o.today) for o in parse_pdf(path).observations}
    for key, want in GOLDEN[name].items():
        assert got.get(key, (None, None)) == want, key
