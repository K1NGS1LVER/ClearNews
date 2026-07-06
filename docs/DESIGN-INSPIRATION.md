# Design inspiration research - ClearNews

Research date: 2026-07-02.
Method: visited each site in a real browser at 1440x900, took notes against the ClearNews redesign brief.
Blocked and skipped: Reuters Graphics (bot wall), Perplexity (Cloudflare check), AllSides (page failed to render headless), FT and Stripe Dashboard (paywall/login).

## Ground News (ground.news) - closest competitor

First thing the eye lands on: story headline, then the tricolor bias bar directly under it.
The bar works because it is the only saturated color in an otherwise near-monochrome dark UI.

- Feed cards: headline (bold, ~20px), tiny 3-segment bias bar (~60px wide, ~6px tall), then one plain-text line: "43% Center coverage: 721 sources". That single line compresses distribution + volume + credibility into 40 characters. Very stealable for our Feed cards.
- Kicker line above each headline: "Aviation Accidents · China" (topic · place) in small muted text. Cheap scent, zero pixels wasted.
- Story page hero: huge headline, then Left/Center/Right segmented-control tabs that swap the AI summary per side. Direct model for our framing-drift display.
- Right rail "Coverage Details": plain label/value table (Total News Sources 1058, Leaning Left 248, ...). No chart where a table is enough.
- Bias Distribution module: full-width bar (L 34% / C 43% / R 23%) with columns of circular outlet logos hanging under each segment. Outlets ARE the data points; logos build trust faster than names.
- "Carolina Coast Online broke the news 3 days ago" - explicit story-birth attribution. We track lifecycle; we should own this pattern harder than they do.
- Article list: filter tabs "All / Left 248 / Center 308 / Right 165" with count badges, and each row = outlet chip + lean badge + headline + relative time.
- Color coding warning: Ground uses red=Left, blue=Right (international convention). US-audience convention is the opposite. Whatever we choose, segments must carry text labels ("L 34%"), never color alone.
- What to avoid: heavy upsell chrome (locked Factuality/Ownership modules, Vantage banners everywhere) and a busy topic-chip bar that competes with content.

## Verity (verity.news) - story clustering, facts vs narratives

- Dark editorial look: serif headlines (Playfair-like) on near-black, sans for everything else. Feels calm and premium; a serif/sans split is worth trying for ClearNews headlines vs data.
- Source attribution as logo cluster: 3 overlapping outlet favicons + "+5 · 48 MINS" per card. More human than a number, cheaper than a bar.
- Story page sections are named claims: "The Facts" (dot-timeline of bullet statements) and a "Sources Split" grid: columns Left/Center/Right crossed with rows Pro-Establishment/Anti, outlet logos placed in cells. A 2D bias map; more nuance than a single axis.
- Left icon rail (Home / Bias Split / Sources / Controversies) is quiet and works, but hides labels until you look; fine for an app, weak for first-time visitors.
- Kicker in tiny caps above headline: "RUSSIA", "QATAR". Same cheap-scent trick as Ground.

## Techmeme (techmeme.com) - density through typography only

- Zero cards, zero images-as-decoration, zero badges. Hierarchy is exclusively: bold serif headline size, then colored source prefix ("Financial Times:"), then link lists.
- The cluster pattern: one big headline, then "More:" followed by a comma-separated inline list of 20 outlets covering the same story. An entire coverage cluster in 3 lines of text. This is the extreme-density end of the spectrum for our story cards; our Feed sits somewhere between Techmeme and Ground.
- Three-column layout: main river / sponsors / "Newest" ticker with timestamps ("20 minutes ago"). Freshness column is a nice model for our Latest tab.
- Lesson: metadata reads fine at 11-12px when the headline contrast is strong. Muted color + small size beats boxes and pills.

## NYT (nytimes.com) - editorial visual weight

- Importance is encoded by size, weight, and position only. No badges, no color chips. The lead story is simply bigger and higher.
- Kicker labels in tiny caps ("ANALYSIS", "LIVE") plus "4 MIN READ" metadata. LIVE is the only red on the page, so it actually means something. Direct lesson for our lifecycle states: emerging/active/declining/dead should not all get colored badges; reserve color for the one state that demands attention (active/spiking), let the rest be text.
- Hairline rules (1px light gray) separate stories instead of card boxes. Sections group related links as plain text chips under a bold section title ("War in the Middle East" + related topic links). Model for our story -> related-articles grouping.

## Our World in Data (ourworldindata.org) - chart system at scale

- One chart grammar everywhere: serif chart title, one-sentence gray subtitle defining the metric, dotted horizontal gridlines only, no vertical gridlines, no chart border.
- Series are labeled directly at the line ends in the series color. No legend box. Recharts can do this with a custom label; it removes a full eye round-trip.
- Palette: 6-7 muted-but-distinct hues (navy, brick red, teal, purple, dark green). Readable on white, colorblind-tested.
- Every chart carries a "Data source:" footer line. For ClearNews: "N articles · M outlets · GDELT" under each chart buys trust for one line of text.
- Table / Map / Line / Bar toggles on the same data. Our Story page could offer chart/table toggle for the drift data.

## Linear (linear.app) - dense lists, restrained color

- Dark UI where hierarchy comes from opacity tiers, not color: primary text ~white, secondary ~60%, tertiary ~40%. Only status icons carry hue (yellow "In Progress").
- Property rows (status, priority, assignee) are icon + short text, all muted until hover. Model for our story-card metadata row (status, article count, outlet count, age).
- Activity feed: tiny avatar + actor bold + action muted + relative time. Model for story timeline events ("story peaked · 34 outlets · 2d ago").
- Lesson: they ship one accent color and get more perceived polish than dashboards with ten.

## The Pudding (pudding.cool)

Playful hand-drawn aesthetic, opposite tonal direction from an analyst tool.
Their scroll-driven "one chart evolves as you read" pattern is still the right interaction model for our narrative-drift story view, if we later build a scrollytelling story page.

## Synthesis - recommended direction for ClearNews

Tone target: Verity's editorial calm + Ground's information payload + OWID's chart discipline, at Linear's polish level.
Avoid: Ground's upsell clutter, badge/pill overuse, more than one accent hue in chrome.

Type: pair a serif for story headlines and page titles (e.g. Source Serif 4 or Newsreader) with the existing sans for UI, metadata, and chart text.
Two headline sizes, one body, one metadata size. That is the whole scale.

Color: near-white background (or keep current dark, but pick one to perfect), ink at 3 opacity tiers like Linear.
Bias palette is semantic and appears nowhere else: Left blue `#3b6fb5`-ish, Center gray, Right red `#b54545`-ish (US convention), always paired with text labels ("L 34%") because Ground proves color alone is ambiguous.
Lifecycle: color only the hot state (active/spiking); emerging/declining/dead are plain text, NYT-style.

The 5 most stealable patterns, mapped to our pages:

1. Ground's one-line coverage summary ("43% Center coverage · 721 sources") + mini bias bar -> Feed story cards.
2. Ground's Coverage Details label/value table + outlet logos under bias-bar segments -> Story page right rail (OutletMap/BiasBar area).
3. Ground's "X broke the news N days ago" birth attribution + Linear's activity-row styling -> Story page lifecycle timeline; this is our differentiator, make it the hero.
4. OWID's chart grammar (dotted gridlines, direct line labels, source footer, no legend) -> all Recharts charts, DriftMap, Sparkline, Analytics page.
5. Techmeme's inline outlet list + NYT kickers (topic · place in tiny caps above headline) -> Latest tab rows and Feed card headers.

Flow note observed while browsing: Ground and Verity both keep story context sticky when you drill into articles (right rail persists).
Our Article page should keep a visible "part of story X" breadcrumb with the story's bias bar, not a bare back link.
