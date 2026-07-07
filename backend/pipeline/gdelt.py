"""GDELT 2.0 GKG ingestion.

Every 15 minutes GDELT publishes a new GKG (Global Knowledge Graph) CSV.
`lastupdate.txt` lists the three latest files (export, mentions, gkg);
we ingest the gkg one: each row is one article with URL, source domain,
tone, themes, and a page title buried in the ExtrasXML column.
"""

import io
import re
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Iterator

import httpx

LASTUPDATE_URL = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt"

# GKG 2.1 tab-separated column indices
_COL_DATE = 1
_COL_DOMAIN = 3
_COL_URL = 4
_COL_THEMES = 7
_COL_TONE = 15
_COL_TRANSLATION = 25
_COL_EXTRAS = 26
_NUM_COLS = 27

_TITLE_RE = re.compile(r"<PAGE_TITLE>(.*?)</PAGE_TITLE>", re.DOTALL)


@dataclass
class GkgRecord:
    url: str
    domain: str
    title: str | None
    published_at: datetime
    tone: float | None
    themes: list[str]


def fetch_latest_gkg_url(client: httpx.Client | None = None) -> str:
    """Return the URL of the most recent 15-minute GKG zip."""
    c = client or httpx.Client(timeout=60)
    resp = c.get(LASTUPDATE_URL)
    resp.raise_for_status()
    for line in resp.text.splitlines():
        url = line.split()[-1]
        if url.endswith(".gkg.csv.zip"):
            return url
    raise ValueError("no gkg file listed in lastupdate.txt")


def download_gkg(url: str, client: httpx.Client | None = None) -> str:
    """Download a GKG zip and return the decoded CSV text."""
    c = client or httpx.Client(timeout=60)
    resp = c.get(url)
    resp.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        name = zf.namelist()[0]
        return zf.read(name).decode("utf-8", errors="replace")


def parse_gkg(csv_text: str, english_only: bool = True) -> Iterator[GkgRecord]:
    """Parse GKG CSV rows into records, skipping malformed or non-article rows."""
    for line in csv_text.splitlines():
        cols = line.split("\t")
        if len(cols) < _NUM_COLS:
            continue
        url = cols[_COL_URL]
        domain = cols[_COL_DOMAIN]
        if not url.startswith("http") or not domain:
            continue  # citation-only or non-web records
        if english_only and cols[_COL_TRANSLATION]:
            continue

        try:
            published_at = datetime.strptime(cols[_COL_DATE], "%Y%m%d%H%M%S").replace(
                tzinfo=UTC
            )
        except ValueError:
            continue

        tone: float | None = None
        if cols[_COL_TONE]:
            try:
                tone = float(cols[_COL_TONE].split(",")[0])
            except ValueError:
                pass

        themes = [t for t in cols[_COL_THEMES].split(";") if t]

        title = None
        m = _TITLE_RE.search(cols[_COL_EXTRAS])
        if m:
            title = m.group(1).strip() or None

        yield GkgRecord(
            url=url,
            domain=domain,
            title=title,
            published_at=published_at,
            tone=tone,
            themes=themes,
        )
