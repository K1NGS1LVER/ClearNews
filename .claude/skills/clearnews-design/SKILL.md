---
name: clearnews-design
description: Prior competitive design research for ClearNews's UI (Ground News, Verity, Techmeme, NYT, Our World in Data, Linear). Use before making non-trivial frontend/UI/styling decisions on ClearNews - bias bars, story cards, charts, lifecycle indicators, typography, color.
---

# ClearNews design research

Full notes (per-site breakdown, screenshots-in-words, synthesis) live in [docs/DESIGN-INSPIRATION.md](../../../docs/DESIGN-INSPIRATION.md) - read it before designing or restyling a page.

Recommended direction distilled from that research: Verity's editorial calm + Ground's information density + OWID's chart discipline, at Linear's polish level.
Serif for headlines/titles, existing sans for UI/metadata/charts. Two headline sizes, one body size, one metadata size - no more.
Color only the one lifecycle state that demands attention (active/spiking); leave the rest as plain text. Bias segments always carry text labels ("L 34%"), never color alone.

The 5 most stealable patterns (see docs/DESIGN-INSPIRATION.md for full detail):

1. One-line coverage summary ("43% Center coverage · 721 sources") + mini bias bar -> Feed story cards.
2. Coverage-details label/value table + outlet logos under bias-bar segments -> Story page right rail.
3. "X broke the news N days ago" birth attribution + activity-row styling -> Story page lifecycle timeline (this is ClearNews's differentiator - make it the hero).
4. Dotted gridlines, direct line labels, source footer, no legend box -> all Recharts charts.
5. Inline outlet list + tiny-caps kickers (topic · place) above headlines -> Latest tab rows and Feed card headers.
