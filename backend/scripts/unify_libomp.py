"""Unify OpenMP runtimes in the venv. Run after every `uv sync`.

torch and scikit-learn wheels each bundle their own libomp.dylib. When one
process loads both (the scheduler and API do: torch for embeddings,
sklearn/hdbscan for clustering), two OpenMP runtimes fight over thread
state and the process eventually segfaults in __kmp barrier code.

macOS dyld deduplicates loaded libraries by inode, so pointing every
bundled copy at one canonical file guarantees a single runtime per
process. Canonical copy: torch's (torch is the most version-sensitive
user). xgboost links Homebrew's libomp, but it always runs in its own
subprocess (see pipeline/predict.py), so it never shares a process.

Run: uv run python scripts/unify_libomp.py
"""

import subprocess
import sys
from pathlib import Path

SITE = Path(__file__).parent.parent / ".venv" / "lib" / "python3.12" / "site-packages"
CANONICAL = SITE / "torch" / "lib" / "libomp.dylib"
XGB_DYLIB = SITE / "xgboost" / "lib" / "libxgboost.dylib"
BREW_OMP_RPATH = "/opt/homebrew/opt/libomp/lib"


def unify_bundled_copies() -> int:
    changed = 0
    for copy in SITE.rglob("libomp.dylib"):
        if copy == CANONICAL:
            continue
        if copy.is_symlink() and copy.resolve() == CANONICAL.resolve():
            print(f"already unified: {copy}")
            continue
        copy.unlink()
        copy.symlink_to(CANONICAL)
        print(f"unified: {copy} -> {CANONICAL}")
        changed += 1
    return changed


def retarget_xgboost() -> bool:
    """Point xgboost's libomp lookup at torch's copy instead of Homebrew's.

    xgboost links `@rpath/libomp.dylib` with an rpath into the Homebrew
    cellar, and it also imports scikit-learn, so without this it loads a
    second OpenMP runtime next to the unified one.
    """
    if not XGB_DYLIB.exists():
        return False
    rpaths = subprocess.run(
        ["otool", "-l", XGB_DYLIB], capture_output=True, text=True
    ).stdout
    if BREW_OMP_RPATH not in rpaths:
        print("xgboost already retargeted")
        return False
    subprocess.run(
        ["install_name_tool", "-rpath", BREW_OMP_RPATH, str(CANONICAL.parent), XGB_DYLIB],
        check=True,
    )
    subprocess.run(["codesign", "-f", "-s", "-", XGB_DYLIB], check=True, capture_output=True)
    print(f"retargeted xgboost rpath: {BREW_OMP_RPATH} -> {CANONICAL.parent}")
    return True


def main() -> int:
    if not CANONICAL.exists():
        print(f"canonical libomp missing: {CANONICAL}")
        return 1
    changed = unify_bundled_copies()
    retargeted = retarget_xgboost()
    print(f"done, {changed} symlinked, xgboost retargeted: {retargeted}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
