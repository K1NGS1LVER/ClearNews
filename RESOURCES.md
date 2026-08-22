# Resources for teaching ClearNews

This file catalogs high-quality, high-trust resources that ground the teaching in real knowledge — not the model's parametric memory.

## Primary sources to consult

- **GDELT Project documentation** — the global knowledge graph (GKG) 2.1 format, the 15-minute publication cycle, the `lastupdate.txt` convention. This is where the raw data comes from.
- **HDBSCAN paper / documentation** — density-based clustering without a pre-specified cluster count. The algorithm behind story grouping.
- **sentence-transformers / MiniLM-L6-v2** — the embedding model used for semantic search and clustering.
- **politicalBiasBERT** — the fine-tuned BERT model for left/center/right classification.
- **VADER sentiment** — rule-based sentiment for social-media-style short text.
- **spaCy NER** — named entity recognition for people, organizations, locations.
- **UMAP** — dimensionality reduction for drift visualization.
- **XGBoost** — the death-prediction classifier.
- **LangGraph / ReAct** — the agent framework.
- **pgvector** — PostgreSQL extension for vector search with cosine distance.
- **Reciprocal Rank Fusion (RRF)** — the fusion method for hybrid search.

## Format

Each resource entry should capture:
- A URL or pointer to the canonical source
- A one-line note on what it explains in the context of ClearNews
- Any caveats (e.g., "trained on X dataset", "free tier has Y limit")
