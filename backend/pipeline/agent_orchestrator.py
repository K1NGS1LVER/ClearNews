"""Adaptive Ingestion Orchestrator Agent for ClearNews.

Replaces blind static polling with velocity-aware orchestration:
- Analyzes recent article ingestion rates across countries and topics.
- Detects bursts / velocity spikes relative to baseline.
- Uses call_pipeline_llm from pipeline.agent_llm to evaluate ambiguous signals
  and prioritize countries for targeted DOC 2.0 ingestion.
- Triggers targeted DOC 2.0 pulls (poll_countries / fetch_country) on demand.
"""

from __future__ import annotations

import json
import logging
import re
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any, Callable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Article, Outlet
from pipeline.agent_llm import call_pipeline_llm, parse_llm_json
from pipeline.country_codes import COUNTRY_NAMES
from pipeline.gdelt_doc import poll_countries

logger = logging.getLogger(__name__)

DEFAULT_RECENT_HOURS = 3
DEFAULT_BASELINE_HOURS = 24
DEFAULT_SPIKE_RATIO_THRESHOLD = 2.0
DEFAULT_AMBIGUOUS_RATIO_THRESHOLD = 1.3
DEFAULT_MIN_RECENT_ARTICLES = 4
DEFAULT_MAX_POLL_COUNT = 3


def get_country_counts(session: Session, since: datetime) -> dict[str, int]:
    """Aggregate article volume per country since `since`.
    
    Combines outlet-level country attribution and NLP mentioned_countries.
    """
    counts: dict[str, int] = defaultdict(int)

    # 1. Volume by Outlet.country
    outlet_rows = session.execute(
        select(Outlet.country, func.count(Article.id))
        .join(Article, Article.outlet_id == Outlet.id)
        .where(Article.ingested_at >= since, Outlet.country.is_not(None))
        .group_by(Outlet.country)
    ).all()
    for country, count in outlet_rows:
        if country and country.upper() in COUNTRY_NAMES:
            counts[country.upper()] += count

    # 2. Volume by Article.mentioned_countries (content-about)
    mentioned_rows = session.execute(
        select(Article.mentioned_countries)
        .where(Article.ingested_at >= since, Article.mentioned_countries.is_not(None))
    ).scalars().all()
    for m_list in mentioned_rows:
        if isinstance(m_list, list):
            for code in set(m_list):
                if isinstance(code, str) and code.upper() in COUNTRY_NAMES:
                    counts[code.upper()] += 1

    return counts


def analyze_velocity(
    session: Session,
    recent_hours: int = DEFAULT_RECENT_HOURS,
    baseline_hours: int = DEFAULT_BASELINE_HOURS,
    spike_threshold: float = DEFAULT_SPIKE_RATIO_THRESHOLD,
    ambiguous_threshold: float = DEFAULT_AMBIGUOUS_RATIO_THRESHOLD,
    min_recent_articles: int = DEFAULT_MIN_RECENT_ARTICLES,
    now: datetime | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Analyze recent article velocity per country relative to baseline.

    Returns:
        (clear_spikes, ambiguous_signals)
    """
    ref_time = now or datetime.now(UTC)
    recent_cutoff = ref_time - timedelta(hours=recent_hours)
    baseline_cutoff = ref_time - timedelta(hours=baseline_hours)

    recent_counts = get_country_counts(session, recent_cutoff)
    baseline_counts = get_country_counts(session, baseline_cutoff)

    clear_spikes: list[dict[str, Any]] = []
    ambiguous_signals: list[dict[str, Any]] = []

    for country, recent_cnt in recent_counts.items():
        if recent_cnt < 2:
            continue

        baseline_cnt = max(baseline_counts.get(country, 0), recent_cnt)
        recent_rate = recent_cnt / max(recent_hours, 1)

        prior_cnt = max(0, baseline_cnt - recent_cnt)
        prior_hours = max(1, baseline_hours - recent_hours)
        prior_rate = prior_cnt / prior_hours
        # Laplace smoothing: assume baseline of at least 0.5 article/hour
        baseline_rate = max(prior_rate, 0.5)

        velocity_ratio = round(recent_rate / baseline_rate, 2)

        record = {
            "country": country,
            "country_name": COUNTRY_NAMES.get(country, country),
            "recent_count": recent_cnt,
            "baseline_count": baseline_cnt,
            "recent_rate": round(recent_rate, 2),
            "baseline_rate": round(baseline_rate, 2),
            "velocity_ratio": velocity_ratio,
        }

        if recent_cnt >= min_recent_articles and velocity_ratio >= spike_threshold:
            clear_spikes.append(record)
        elif velocity_ratio >= ambiguous_threshold:
            ambiguous_signals.append(record)

    clear_spikes.sort(key=lambda x: x["velocity_ratio"], reverse=True)
    ambiguous_signals.sort(key=lambda x: x["velocity_ratio"], reverse=True)

    return clear_spikes, ambiguous_signals


def prioritize_with_llm(
    clear_spikes: list[dict[str, Any]],
    ambiguous_signals: list[dict[str, Any]],
    max_count: int = DEFAULT_MAX_POLL_COUNT,
) -> list[str]:
    """Use pipeline LLM to evaluate ambiguous signals or prioritize candidate countries."""
    all_candidates = [s["country"] for s in clear_spikes] + [s["country"] for s in ambiguous_signals]
    if not all_candidates:
        return []

    # If all candidates fit comfortably within quota and no ambiguous signals need vetting
    if not ambiguous_signals and len(clear_spikes) <= max_count:
        return [s["country"] for s in clear_spikes]

    prompt = f"""You are the ClearNews Ingestion Orchestrator Agent.
The news ingestion pipeline detected the following countries with breaking velocity spikes or elevated ambiguous signals:

Clear Spikes:
{json.dumps(clear_spikes, indent=2)}

Ambiguous Signals:
{json.dumps(ambiguous_signals, indent=2)}

Your task:
1. Evaluate which countries warrant an immediate targeted GDELT DOC 2.0 pull.
2. Select at most {max_count} countries, prioritizing those with true breaking news significance or strong burst momentum.

Respond strictly in valid JSON format:
{{
  "prioritized_countries": ["<ISO2>", ...],
  "reasoning": "<short explanation>"
}}
"""
    system = "You are an intelligent news pipeline orchestrator optimizing data ingestion resources. Output JSON only."

    try:
        raw_resp = call_pipeline_llm(prompt, system=system, json_mode=True)
        data = parse_llm_json(raw_resp)
        prioritized = data.get("prioritized_countries", [])
        if isinstance(prioritized, list):
            valid = [
                c.upper()
                for c in prioritized
                if isinstance(c, str) and c.upper() in all_candidates
            ]
            if valid:
                return valid[:max_count]
    except Exception as exc:
        logger.warning("LLM prioritization failed (%s). Falling back to heuristic ranking.", exc)

    # Fallback: take clear spikes first, then ambiguous signals, up to max_count
    combined = [s["country"] for s in clear_spikes] + [s["country"] for s in ambiguous_signals]
    return combined[:max_count]


def run_adaptive_orchestration(
    session: Session | None = None,
    recent_hours: int = DEFAULT_RECENT_HOURS,
    baseline_hours: int = DEFAULT_BASELINE_HOURS,
    spike_threshold: float = DEFAULT_SPIKE_RATIO_THRESHOLD,
    ambiguous_threshold: float = DEFAULT_AMBIGUOUS_RATIO_THRESHOLD,
    min_recent_articles: int = DEFAULT_MIN_RECENT_ARTICLES,
    max_poll_count: int = DEFAULT_MAX_POLL_COUNT,
    poll_func: Callable[[list[str]], dict[str, int]] | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Execute one cycle of velocity-aware adaptive ingestion orchestration.

    1. Analyzes ingestion rates across countries.
    2. Identifies burst spikes and ambiguous signals.
    3. Invokes LLM prioritization to select targeted countries.
    4. Dynamically triggers targeted DOC 2.0 pulls.
    """
    if session is None:
        with SessionLocal() as db:
            return run_adaptive_orchestration(
                session=db,
                recent_hours=recent_hours,
                baseline_hours=baseline_hours,
                spike_threshold=spike_threshold,
                ambiguous_threshold=ambiguous_threshold,
                min_recent_articles=min_recent_articles,
                max_poll_count=max_poll_count,
                poll_func=poll_func,
                now=now,
            )

    clear_spikes, ambiguous_signals = analyze_velocity(
        session=session,
        recent_hours=recent_hours,
        baseline_hours=baseline_hours,
        spike_threshold=spike_threshold,
        ambiguous_threshold=ambiguous_threshold,
        min_recent_articles=min_recent_articles,
        now=now,
    )

    if not clear_spikes and not ambiguous_signals:
        return {
            "status": "idle",
            "clear_spikes": [],
            "ambiguous_signals": [],
            "selected_countries": [],
            "pull_results": {},
        }

    # Decide which countries to trigger using LLM evaluation
    selected_countries = prioritize_with_llm(
        clear_spikes=clear_spikes,
        ambiguous_signals=ambiguous_signals,
        max_count=max_poll_count,
    )

    pull_results: dict[str, int] = {}
    if selected_countries:
        poller = poll_func or poll_countries
        logger.info(
            "Adaptive orchestrator triggering targeted DOC 2.0 pulls for: %s",
            selected_countries,
        )
        try:
            pull_results = poller(selected_countries)
        except Exception as exc:
            logger.error("Failed to execute targeted DOC 2.0 pull: %s", exc)

    return {
        "status": "triggered" if selected_countries else "idle",
        "clear_spikes": clear_spikes,
        "ambiguous_signals": ambiguous_signals,
        "selected_countries": selected_countries,
        "pull_results": pull_results,
    }
