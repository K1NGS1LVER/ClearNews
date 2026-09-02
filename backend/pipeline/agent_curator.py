"""Story Curator Agent for ClearNews.

Audits HDBSCAN clusters and generates neutral synthetic headlines, coherence
scores, and objective summaries using the pipeline LLM router with graceful
heuristic fallback.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import Article, Story
from pipeline.agent_llm import call_pipeline_llm

logger = logging.getLogger(__name__)

CURATOR_SYSTEM_PROMPT = """You are an objective news curator for ClearNews.
Your task is to audit an automated cluster of news articles and generate:
1. "headline": A neutral, objective synthetic title capturing the core event (no clickbait, no partisan slant, factual).
2. "coherence_score": A float between 0.0 and 1.0 rating whether all articles describe the same underlying story (1.0 = all describe the exact same event; <0.5 = mixed or disparate topics).
3. "summary": A 1-2 sentence objective summary of the core development.

Respond with valid JSON only matching the schema:
{"headline": string, "coherence_score": float, "summary": string}"""


def _parse_llm_json(raw: str) -> dict[str, Any]:
    """Extract and parse JSON from an LLM response string."""
    text = raw.strip()
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        text = match.group(1)
    else:
        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
            text = text[brace_start : brace_end + 1]
    return json.loads(text)


def build_curator_prompt(articles: list[dict[str, Any]]) -> str:
    """Build a compact prompt describing the clustered articles."""
    lines = []
    for i, a in enumerate(articles[:15], 1):
        title = (a.get("title") or "").strip()
        domain = (a.get("domain") or "").strip()
        themes = a.get("themes") or []
        theme_str = ", ".join(str(t) for t in themes[:5])
        parts = [f"{i}. Title: {title or 'Untitled'}"]
        if domain:
            parts.append(f"Domain: {domain}")
        if theme_str:
            parts.append(f"Themes: {theme_str}")
        lines.append(" | ".join(parts))

    cluster_text = "\n".join(lines)
    return (
        f"Cluster of {len(articles)} articles:\n"
        f"{cluster_text}\n\n"
        "Return the neutral synthetic headline, coherence_score (0.0 to 1.0), and 1-2 sentence summary as JSON."
    )


def clean_headline_candidate(title: str) -> str:
    """Strip common outlet suffixes like ' - Reuters' or ' | CNN'."""
    cleaned = re.sub(r"\s*[-|–—]\s*[^|–—]{2,30}$", "", title).strip()
    return cleaned if len(cleaned) >= 10 else title.strip()


def heuristic_curate(articles: list[dict[str, Any]], fallback_title: str | None = None) -> dict[str, Any]:
    """Fallback curation when the LLM is unavailable, timed out, or unparseable."""
    titles = [a.get("title", "").strip() for a in articles if a.get("title")]
    if not titles and fallback_title:
        titles = [fallback_title.strip()]

    headline = clean_headline_candidate(titles[0]) if titles else "News Development"

    # Coherence score heuristic: clusters with 1-5 articles default to 0.85; larger default to 0.80
    coherence_score = 0.85 if len(articles) <= 5 else 0.80

    summary = f"Reporting on developments regarding {headline.lower()}." if headline else "Recent news updates."
    return {
        "headline": headline,
        "coherence_score": coherence_score,
        "summary": summary,
    }


def audit_cluster(articles: list[dict[str, Any]], fallback_title: str | None = None) -> dict[str, Any]:
    """Audit an article cluster and return structured curation data.

    Given a list of article dicts (titles, themes, domains), prompts the LLM for:
    - headline: neutral objective synthetic title
    - coherence_score: float 0.0 - 1.0
    - summary: 1-2 sentence summary
    Falls back to heuristic_curate on any failure.
    """
    if not articles:
        return {
            "headline": fallback_title or "News Development",
            "coherence_score": 0.5,
            "summary": "No articles available.",
        }

    try:
        prompt = build_curator_prompt(articles)
        raw_output = call_pipeline_llm(prompt=prompt, system=CURATOR_SYSTEM_PROMPT, json_mode=True)
        data = _parse_llm_json(raw_output)

        headline = str(data.get("headline", "")).strip()
        if not headline:
            raise ValueError("LLM returned empty headline")

        raw_score = data.get("coherence_score")
        if raw_score is None:
            coherence_score = 0.8
        else:
            coherence_score = max(0.0, min(1.0, float(raw_score)))

        summary = str(data.get("summary", "")).strip()
        if not summary:
            summary = f"Coverage regarding {headline}."

        return {
            "headline": headline,
            "coherence_score": coherence_score,
            "summary": summary,
        }
    except Exception as e:
        logger.warning("LLM cluster curation failed (%s); falling back to heuristic", e)
        return heuristic_curate(articles, fallback_title=fallback_title)


def curate_story(session: Session, story_id: int) -> dict[str, Any]:
    """Curate a single story: audit cluster articles, compute headline and coherence.

    Updates story.agent_headline, story.coherence_score, and story.summary (if empty).
    Returns dict with headline, coherence_score, summary.
    """
    story = session.get(Story, story_id)
    if not story:
        return {}

    articles = (
        session.execute(
            select(Article)
            .where(Article.story_id == story_id)
            .options(joinedload(Article.outlet))
        )
        .scalars()
        .all()
    )

    article_dicts = []
    for a in articles:
        domain = ""
        if a.outlet and a.outlet.domain:
            domain = a.outlet.domain
        elif a.url:
            domain = urlsplit(a.url).netloc
        article_dicts.append({
            "title": a.title or "",
            "domain": domain,
            "themes": a.themes or [],
        })

    curation = audit_cluster(article_dicts, fallback_title=story.title)

    if hasattr(story, "agent_headline"):
        story.agent_headline = curation["headline"]
    if hasattr(story, "coherence_score"):
        story.coherence_score = curation["coherence_score"]
    if hasattr(story, "summary") and not story.summary:
        story.summary = curation["summary"]

    session.flush()
    return curation


def curate_touched_stories(session: Session, story_ids: set[int]) -> int:
    """Curate all stories whose membership changed during clustering.

    Returns the count of successfully curated stories.
    """
    if not story_ids:
        return 0

    count = 0
    for sid in sorted(story_ids):
        try:
            res = curate_story(session, sid)
            if res:
                count += 1
        except Exception as e:
            logger.error("Failed to curate story %d: %s", sid, e)

    session.commit()
    return count
