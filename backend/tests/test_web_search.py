"""web_search tool: provider selection and response parsing.

Every provider branch does its own hand-rolled JSON shaping, so each one
gets a mocked-transport test rather than relying on chat-session tests
(which stub stream_chat entirely and never touch this code path)."""

import httpx
import pytest

import agent.tools as tools_mod
from agent.tools import web_search


class _Response:
    def __init__(self, json_data, status_code=200):
        self._json = json_data
        self.status_code = status_code

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("error", request=None, response=self)


def test_searxng_default_provider_parses_results(monkeypatch):
    monkeypatch.delenv("WEB_SEARCH_PROVIDER", raising=False)
    captured = {}

    def fake_get(url, params=None, timeout=None):
        captured["url"] = url
        captured["params"] = params
        return _Response({
            "results": [
                {"title": "A", "url": "https://a.test", "engine": "duckduckgo", "content": "snippet a"},
                {"title": "B", "url": "https://b.test", "content": "snippet b"},
                {"title": "no url, dropped"},
            ]
        })

    monkeypatch.setattr(tools_mod.httpx, "get", fake_get)

    results = web_search.invoke({"query": "tariffs"})

    assert captured["params"] == {"q": "tariffs", "format": "json"}
    assert results == [
        {"citation_id": "web:1", "source_type": "web", "title": "A", "url": "https://a.test",
         "outlet": "duckduckgo", "snippet": "snippet a"},
        {"citation_id": "web:2", "source_type": "web", "title": "B", "url": "https://b.test",
         "outlet": "web", "snippet": "snippet b"},
    ]


def test_searxng_json_format_disabled_returns_no_results(monkeypatch):
    """Stock SearXNG serves only html unless format:json is enabled in
    settings.yml; that shows up as an HTTP error, not a parse failure."""
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", "searxng")
    monkeypatch.setattr(tools_mod.httpx, "get", lambda *a, **k: _Response({}, status_code=403))

    assert web_search.invoke({"query": "tariffs"}) == "No live web results found for query: 'tariffs'."


def test_searxng_unreachable_returns_no_results(monkeypatch):
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", "searxng")

    def fake_get(*_a, **_k):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(tools_mod.httpx, "get", fake_get)

    assert web_search.invoke({"query": "tariffs"}) == "No live web results found for query: 'tariffs'."


def test_tavily_provider_parses_results(monkeypatch):
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", "tavily")
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    captured = {}

    def fake_post(url, json=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        return _Response({"results": [
            {"title": "A", "url": "https://a.test", "content": "snippet a"},
        ]})

    monkeypatch.setattr(tools_mod.httpx, "post", fake_post)

    results = web_search.invoke({"query": "tariffs"})

    assert captured["json"]["api_key"] == "test-key"
    assert results == [
        {"citation_id": "web:1", "source_type": "web", "title": "A", "url": "https://a.test",
         "outlet": "web", "snippet": "snippet a"},
    ]


def test_brave_provider_parses_results(monkeypatch):
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", "brave")
    monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "test-key")
    captured = {}

    def fake_get(url, params=None, headers=None, timeout=None):
        captured["headers"] = headers
        return _Response({"web": {"results": [
            {"title": "A", "url": "https://a.test", "description": "snippet a"},
        ]}})

    monkeypatch.setattr(tools_mod.httpx, "get", fake_get)

    results = web_search.invoke({"query": "tariffs"})

    assert captured["headers"]["X-Subscription-Token"] == "test-key"
    assert results == [
        {"citation_id": "web:1", "source_type": "web", "title": "A", "url": "https://a.test",
         "outlet": "web", "snippet": "snippet a"},
    ]


@pytest.mark.parametrize("provider", ["tavily", "brave"])
def test_hosted_provider_without_key_returns_no_results(monkeypatch, provider):
    """A misconfigured deployment (provider selected, key not supplied) must
    degrade to no live-web results, not raise past the agent tool boundary."""
    monkeypatch.setenv("WEB_SEARCH_PROVIDER", provider)
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    monkeypatch.delenv("BRAVE_SEARCH_API_KEY", raising=False)

    assert web_search.invoke({"query": "tariffs"}) == "No live web results found for query: 'tariffs'."
