import httpx
import pytest

from pipeline.gdelt_doc import fetch_country

SAMPLE_RESPONSE = {
    "articles": [
        {
            "url": "https://indianexpress.com/article/example",
            "domain": "indianexpress.com",
            "title": "Example headline",
            "seendate": "20260710T173000Z",
            "sourcecountry": "India",
        },
        {
            # a stray cross-country hit DOC API sometimes returns - must be dropped
            "url": "https://bbc.co.uk/article/example",
            "domain": "bbc.co.uk",
            "title": "Wrong country hit",
            "seendate": "20260710T173000Z",
            "sourcecountry": "United Kingdom",
        },
        {
            # missing url - malformed, must be skipped rather than crash
            "domain": "example.com",
            "title": "No url",
            "seendate": "20260710T173000Z",
            "sourcecountry": "India",
        },
    ]
}


def _mock_client(json_body, status_code=200):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json=json_body)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_fetch_country_parses_and_filters_cross_country_hits():
    client = _mock_client(SAMPLE_RESPONSE)
    records = list(fetch_country("IN", client=client))
    assert len(records) == 1
    r = records[0]
    assert r.domain == "indianexpress.com"
    assert r.url == "https://indianexpress.com/article/example"
    assert r.title == "Example headline"
    assert r.published_at.year == 2026
    assert r.tone is None
    assert r.themes == []


def test_fetch_country_unknown_code_raises():
    with pytest.raises(ValueError):
        list(fetch_country("ZZ", client=_mock_client(SAMPLE_RESPONSE)))


def test_fetch_country_non_json_response_raises_not_crashes():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="Please limit requests to one every 5 seconds")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    with pytest.raises(RuntimeError):
        list(fetch_country("IN", client=client))


def test_fetch_country_empty_articles():
    client = _mock_client({"articles": []})
    assert list(fetch_country("IN", client=client)) == []
