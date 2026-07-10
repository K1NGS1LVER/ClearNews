from pathlib import Path

from pipeline.gdelt import _parse_locations, parse_gkg

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
        for code in r.mentioned_countries:
            assert len(code) == 2 and code.isupper()

    # a real GKG slice should have titles and themes on most rows
    assert sum(1 for r in records if r.title) > len(records) / 2
    assert any(r.themes for r in records)
    assert any(r.mentioned_countries for r in records)


def test_parse_gkg_skips_garbage():
    assert list(parse_gkg("not\ta\tvalid\trow")) == []
    assert list(parse_gkg("")) == []


def test_parse_locations_v2_format():
    # LocationType#FullName#CountryCode(FIPS)#ADM1#ADM2#Lat#Lon#FeatureID#CharOffset
    raw = (
        "4#Vellore, Tamil Nadu, India#IN#IN25#70254#12.9333#79.1333#-2114336#552;"
        "1#Vietnamese#VM#VM##16.166667#107.833333#VM#956"
    )
    assert _parse_locations(raw) == ["IN", "VN"]


def test_parse_locations_dedupes_and_skips_unknown():
    raw = "4#A#IN#x#y#1#2#3#4;4#B#IN#x#y#1#2#3#4;4#C#ZZ#x#y#1#2#3#4"
    assert _parse_locations(raw) == ["IN"]  # dupes collapsed, unknown FIPS dropped


def test_parse_locations_empty():
    assert _parse_locations("") == []
    assert _parse_locations("garbage#nofields") == []
