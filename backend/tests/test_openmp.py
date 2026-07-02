"""Guard against multiple OpenMP runtimes (macOS segfault under load).

torch and scikit-learn wheels bundle their own libomp.dylib and xgboost
links Homebrew's; any process that ends up with two runtimes crashes in
OpenMP barrier code. `uv sync` restores the wheels, so these must stay
checked. Fix: uv run python scripts/unify_libomp.py
"""

import subprocess
from pathlib import Path

SITE = Path(__file__).parent.parent / ".venv/lib/python3.12/site-packages"


def test_single_bundled_libomp():
    copies = list(SITE.rglob("libomp.dylib"))
    inodes = {p.stat().st_ino for p in copies}
    assert len(inodes) <= 1, (
        f"{len(inodes)} distinct libomp.dylib files: {copies}. "
        "Run: uv run python scripts/unify_libomp.py"
    )


def test_xgboost_not_linked_to_homebrew_libomp():
    dylib = SITE / "xgboost" / "lib" / "libxgboost.dylib"
    if not dylib.exists():
        return
    rpaths = subprocess.run(
        ["otool", "-l", dylib], capture_output=True, text=True
    ).stdout
    assert "/opt/homebrew/opt/libomp" not in rpaths, (
        "xgboost resolves Homebrew's libomp - a second OpenMP runtime. "
        "Run: uv run python scripts/unify_libomp.py"
    )
