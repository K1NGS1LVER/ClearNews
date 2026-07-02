# ClearNews demo script (~5 minutes)

## Setup before the demo

1. `brew services start postgresql@17`, backend `uv run uvicorn app.main:app`, frontend `pnpm dev`.
2. Make sure the pipeline ran recently: `uv run python -m pipeline.ingest && uv run python -m pipeline.nlp && uv run python -m pipeline.cluster && uv run python -m pipeline.metrics && uv run python -m pipeline.topics`.
3. Open http://localhost:5173.

## Narrative

**1. The problem (30s).**
News aggregators show today's headlines with no memory.
Stories explode, mutate, and vanish without resolution.
ClearNews tracks stories as living entities built from GDELT, the largest open news dataset on earth (a new file every 15 minutes).

**2. Feed (45s).**
Each card is a story, not an article: status dot (active/fading/dead), lifecycle sparkline, and the signature left/center/right bias bar computed per article by a transformer classifier, not static outlet labels.

**3. Story arc (90s).**
Open the US-Iran talks story.
Walk down the page: coverage volume, coverage lean over time, sentiment trajectory, narrative drift.
Then the drift map: every dot is an article positioned by meaning; the dashed line is the daily centroid of coverage.
A straight line means stable framing; a bend means the narrative pivoted.

**4. Ask the agent (60s).**
In "Ask about this story", ask: "How did the framing of this story change and which outlets leaned hardest?"
Point out the citation chips: every claim resolves to a real article, retrieved live from pgvector by the LangGraph agent.
Click a suggested follow-up question.

**5. Analytics (45s).**
Stories by category with average lifespan, corpus-wide political lean, the outlet similarity map (proximity = similar coverage, color = measured lean, size = volume), and the death-risk table once the XGBoost model has 30+ days of history to train on.

**6. Search (30s).**
Search: "diplomatic talks that eased oil prices".
Results ranked by meaning, not keywords.

## Likely questions

- **Where does bias come from?** politicalBiasBERT scores each article's text; outlet lean is the average of its articles, so it is measured, not assumed.
- **What is narrative drift?** Distance between consecutive daily centroids of article embeddings; movement in embedding space = framing change before it is obvious in the words.
- **Cost?** Zero. GDELT, free model inference on Groq, free-tier hosting (Vercel/Render/Supabase).
