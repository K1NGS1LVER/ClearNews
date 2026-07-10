"""Country taxonomy for user preferences and filters - the single source of
truth for which countries are selectable, mirroring pipeline/topics.py's
CATEGORY_PROMPTS for categories.

Reuses pipeline/country_codes.py's ISO-2 name table (the same one GDELT DOC
2.0 ingestion uses) rather than a second list, so "selectable in onboarding"
and "what the pipeline can actually fetch" never drift apart.
"""

from pipeline.country_codes import COUNTRY_NAMES as SUPPORTED_COUNTRIES

__all__ = ["SUPPORTED_COUNTRIES"]
