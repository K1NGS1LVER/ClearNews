"""Narrative Evolution Agent for ClearNews.

Detects narrative drift inflection points in story coverage across days and
appends structured timeline milestones using the pipeline LLM.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date as dt_date
import json
import logging
import os
import re
from typing import Any

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Article, Story, StoryDailyMetric
from pipeline.agent_llm import call_pipeline_llm

logger = logging.getLogger(__name__)

DEFAULT_DRIFT_THRESHOLD = float(os.getenv("NARRATIVE_DRIFT_THRESHOLD", "0.45"))

NARRATIVE_SYSTEM_PROMPT = """You are a narrative evolution analyst for ClearNews.
You track how news stories unfold and change over time. Given a date, story context, and description of a narrative shift or coverage development, summarize it into a structured timeline milestone.

Respond with valid JSON only matching the schema:
{
  "date": "YYYY-MM-DD",
  "event": "Concise 1-sentence description of the key factual event or catalyst.",
  "narrative_shift": "Concise 1-sentence description of how media framing, focus, or tone changed."
}"""


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


def summarize_milestone_with_llm(
    date_str: str,
    shift_description: str,
    story_title: str | None = None,
) -> dict[str, str]:
    """Ask agent_llm to summarize the development into a structured milestone."""
    prompt = (
        f"Date: {date_str}\n"
        f"Story: {story_title or 'News development'}\n"
        f"Development / Shift: {shift_description}\n\n"
        "Return the structured milestone as JSON with keys: date, event, narrative_shift."
    )
    try:
        raw_output = call_pipeline_llm(
            prompt=prompt,
            system=NARRATIVE_SYSTEM_PROMPT,
            json_mode=True,
        )
        data = _parse_llm_json(raw_output)
        event = str(data.get("event", "")).strip()
        shift = str(data.get("narrative_shift", "")).strip()
        if not event or not shift:
            raise ValueError("Incomplete milestone payload from LLM")
        return {
            "date": date_str,
            "event": event,
            "narrative_shift": shift,
        }
    except Exception as e:
        logger.warning("LLM milestone summary failed (%s); using fallback heuristic", e)
        event = (story_title or "Coverage inflection point").strip()
        shift = shift_description.strip() or "Coverage focus evolved significantly."
        return {
            "date": date_str,
            "event": event,
            "narrative_shift": shift,
        }


def record_story_milestone(
    session: Session,
    story_id: int,
    date: str,
    shift_description: str,
) -> dict[str, Any] | None:
    """Ask agent_llm to summarize development into a milestone and append to story.milestones.

    Returns the milestone dict or None if story not found.
    """
    story = session.get(Story, story_id)
    if not story:
        return None

    milestone = summarize_milestone_with_llm(
        date_str=date,
        shift_description=shift_description,
        story_title=story.title,
    )

    current_milestones = list(story.milestones or []) if hasattr(story, "milestones") else []
    # Avoid duplicate milestones on the same date by updating if present
    existing_idx = next(
        (i for i, m in enumerate(current_milestones) if isinstance(m, dict) and m.get("date") == date),
        None,
    )
    if existing_idx is not None:
        current_milestones[existing_idx] = milestone
    else:
        current_milestones.append(milestone)
        current_milestones.sort(key=lambda m: str(m.get("date", "")))

    story.milestones = current_milestones
    session.flush()
    return milestone


def detect_and_record_story_milestones(
    session: Session,
    story_id: int,
    threshold: float = DEFAULT_DRIFT_THRESHOLD,
) -> list[dict[str, Any]]:
    """Check if drift between days exceeds threshold and record milestones.

    Inspects StoryDailyMetric records for story_id or calculates day-to-day
    drift directly from article embeddings if metrics are missing.
    """
    story = session.get(Story, story_id)
    if not story:
        return []

    # 1. Try StoryDailyMetric first
    metrics = (
        session.execute(
            select(StoryDailyMetric)
            .where(StoryDailyMetric.story_id == story_id)
            .order_by(StoryDailyMetric.day)
        )
        .scalars()
        .all()
    )

    inflection_dates: list[tuple[str, float]] = []
    if metrics:
        for m in metrics:
            if m.drift_score is not None and m.drift_score >= threshold:
                inflection_dates.append((m.day.isoformat(), float(m.drift_score)))
    else:
        # Fallback: compute centroid drift from article embeddings
        articles = (
            session.execute(
                select(Article)
                .where(Article.story_id == story_id, Article.embedding.isnot(None))
                .order_by(Article.published_at)
            )
            .scalars()
            .all()
        )
        by_day: dict[dt_date, list[np.ndarray]] = defaultdict(list)
        for a in articles:
            if a.embedding is not None and a.published_at is not None:
                by_day[a.published_at.date()].append(np.array(a.embedding))

        days = sorted(by_day.keys())
        if len(days) >= 2:
            centroids = {d: np.mean(by_day[d], axis=0) for d in days}
            for prev, curr in zip(days, days[1:]):
                drift = float(np.linalg.norm(centroids[curr] - centroids[prev]))
                if drift >= threshold:
                    inflection_dates.append((curr.isoformat(), drift))

    if not inflection_dates:
        return []

    # For each inflection date, gather articles from that day to describe shift
    recorded = []
    for day_str, drift_val in inflection_dates:
        # Fetch articles for that day
        day_articles = (
            session.execute(
                select(Article).where(Article.story_id == story_id)
            )
            .scalars()
            .all()
        )
        matched_titles = [
            a.title for a in day_articles
            if a.published_at and a.published_at.date().isoformat() == day_str and a.title
        ]
        sample_titles = "; ".join(matched_titles[:3]) if matched_titles else "New developments emerged"
        shift_desc = f"Coverage drifted significantly (drift={drift_val:.2f}): {sample_titles}"

        m = record_story_milestone(session, story_id, day_str, shift_desc)
        if m:
            recorded.append(m)

    return recorded
