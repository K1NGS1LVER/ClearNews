from pipeline.country_codes import (
    COUNTRY_NAMES,
    fips_to_iso2,
    gdelt_name_to_iso2,
    iso2_to_gdelt_query,
)


def test_iso2_to_query_strips_and_lowercases():
    assert iso2_to_gdelt_query("IN") == "india"
    assert iso2_to_gdelt_query("GB") == "unitedkingdom"
    assert iso2_to_gdelt_query("zz") is None  # unknown code, not a guess


def test_gdelt_name_round_trips_for_every_supported_country():
    for code, name in COUNTRY_NAMES.items():
        assert gdelt_name_to_iso2(name) == code


def test_gdelt_name_aliases():
    assert gdelt_name_to_iso2("South Korea") == "KR"
    assert gdelt_name_to_iso2("Korea, South") == "KR"
    assert gdelt_name_to_iso2("North Korea") == "KP"
    assert gdelt_name_to_iso2("Czechia") == "CZ"
    assert gdelt_name_to_iso2("USA") == "US"
    assert gdelt_name_to_iso2("Atlantis") is None  # not a real country, not guessed


def test_fips_iso2_divergence_gotchas():
    """FIPS and ISO-2 are NOT the same code space - these are the classic
    traps (a wrong mapping here would silently mis-tag a country's articles,
    not just skip them, so they're worth pinning explicitly)."""
    assert fips_to_iso2("UK") == "GB"
    assert fips_to_iso2("JA") == "JP"
    assert fips_to_iso2("GM") == "DE"
    assert fips_to_iso2("AU") == "AT"  # FIPS "AU" is Austria...
    assert fips_to_iso2("AS") == "AU"  # ...ISO "AU" is Australia, FIPS "AS" is
    assert fips_to_iso2("IN") == "IN"
    assert fips_to_iso2("zz") is None
