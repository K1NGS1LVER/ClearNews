from pathlib import Path

from pipeline.gdelt import parse_gkg

FIXTURE = Path(__file__).parent / "fixtures" / "gkg_sample.csv"


def test_parse_gkg_fixture():
    records = list(parse_gkg(FIXTURE.read_text(encoding="utf-8")))
    assert records, "fixture should yield at least one record"

    for r in records:
        assert r.url.startswith("http")
        assert r.domain
        assert r.published_at.tzinfo is not None
        if r.tone is not None:
            assert -100 <= r.tone <= 100

    # a real GKG slice should have titles and themes on most rows
    assert sum(1 for r in records if r.title) > len(records) / 2
    assert any(r.themes for r in records)


def test_parse_gkg_skips_garbage():
    assert list(parse_gkg("not\ta\tvalid\trow")) == []
    assert list(parse_gkg("")) == []
