import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { decodeEntities, fetchStories, searchStories } from "../api";
import { LeanBar, MetaLine } from "../components/StoryBits";

const mono = { fontFamily: "var(--font-mono)" } as const;
const serif = { fontFamily: "var(--font-serif)" } as const;

const chip = (label: string | null) => ({
  background: label === "left" ? "var(--bias-left)" : label === "right" ? "var(--bias-right)" : "var(--chip-center-bg)",
  color: label === "center" || !label ? "var(--chip-center-ink)" : "#fff",
});

const statusColor: Record<string, string> = {
  active: "var(--status-active)",
  fading: "var(--status-fading)",
  dead: "var(--status-dead)",
};

const SUGGESTED_QUERIES = [
  "Diplomatic negotiations & ceasefire terms",
  "Central bank rate cuts and inflation debate",
  "Renewable energy transition vs energy security",
  "Antitrust regulations on Big Tech and AI",
  "Immigration policy and border enforcement",
  "Trade tariffs, domestic manufacturing & supply chains",
];

export default function Search() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  const { data, isFetching } = useQuery({
    queryKey: ["searchStories", query],
    queryFn: () => searchStories(query),
    enabled: query.length > 0,
  });

  const { data: popularStories } = useQuery({
    queryKey: ["popularSearchSuggestions"],
    queryFn: () => fetchStories({ limit: 6, status: "active" }),
    enabled: query.length === 0,
  });

  const handleSearch = (term: string) => {
    setInput(term);
    setQuery(term);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-2 sm:px-8">
      <form
        className="mb-5 flex gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input);
        }}
      >
        <div
          className="flex flex-1 items-center gap-2.5 rounded-lg px-4 py-2.5"
          style={{ border: "1.5px solid var(--ink)", background: "var(--surface-1)" }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="diplomatic talks that eased oil prices…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--ink)" }}
          />
          <span className="hidden shrink-0 sm:inline" style={{ ...mono, fontSize: "9.5px", color: "var(--baseline)" }}>
            SEMANTIC · MEANING, NOT KEYWORDS
          </span>
        </div>
        <button
          type="submit"
          disabled={!input.trim() || isFetching}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
          style={{ background: "var(--ink)", color: "var(--surface-1)" }}
        >
          {isFetching ? "Searching…" : "Search"}
        </button>
      </form>

      {/* When no search is active, display curated topics & popular opinions */}
      {!query && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2.5">
            <span style={{ ...mono, fontSize: "10.5px", letterSpacing: "0.08em", color: "var(--ink-muted)" }}>
              SUGGESTED PERSPECTIVES · MAJOR OPINION DEBATES
            </span>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUERIES.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSearch(suggestion)}
                  className="cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors hover:border-[var(--ink)]"
                  style={{
                    borderColor: "var(--hair)",
                    background: "var(--surface-1)",
                    color: "var(--ink)",
                  }}
                >
                  <span style={{ color: "var(--baseline)", marginRight: 5 }}>⌕</span>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {popularStories && popularStories.length > 0 && (
            <div className="flex flex-col gap-3 border-t pt-5" style={{ borderColor: "var(--hair)" }}>
              <div className="flex items-center justify-between">
                <span style={{ ...mono, fontSize: "10.5px", letterSpacing: "0.08em", color: "var(--ink-muted)" }}>
                  POPULAR STORIES ACROSS PERSPECTIVES
                </span>
                <span className="hidden sm:inline" style={{ ...mono, fontSize: "9.5px", color: "var(--baseline)" }}>
                  POLITICAL DIVERSITY
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {popularStories.map((story) => (
                  <div
                    key={story.id}
                    className="flex flex-col justify-between gap-3 rounded-lg border p-3.5 transition-colors hover:border-[var(--ink)]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
                  >
                    <div className="flex flex-col gap-1.5">
                      <MetaLine s={story} />
                      <Link
                        to={`/story/${story.id}`}
                        className="line-clamp-2 text-sm font-semibold hover:underline"
                        style={{ ...serif, color: "var(--ink)" }}
                      >
                        {decodeEntities(story.agent_headline || story.title)}
                      </Link>
                    </div>
                    <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--hair)" }}>
                      <LeanBar left={story.bias_left_share} center={story.bias_center_share} right={story.bias_right_share} />
                      <button
                        type="button"
                        onClick={() => handleSearch(decodeEntities(story.agent_headline || story.title))}
                        className="cursor-pointer text-[10px] font-semibold hover:underline"
                        style={{ ...mono, color: "var(--ink-muted)" }}
                        title="Search related coverage"
                      >
                        SEARCH ⌕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search results view */}
      {data && (
        <div className="flex items-center justify-between">
          <span style={{ ...mono, fontSize: "10.5px", letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
            {data.length} STORY MATCH{data.length === 1 ? "" : "ES"}
          </span>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setInput("");
            }}
            className="cursor-pointer text-xs font-medium hover:underline"
            style={{ ...mono, color: "var(--ink-muted)" }}
          >
            Clear search ✕
          </button>
        </div>
      )}
      {data && data.length === 0 && (
        <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>No matches found for "{query}".</p>
      )}
      <div className="mt-3 flex flex-col gap-4">
        {data?.map((s) => (
          <section
            key={s.story_id}
            className="flex flex-col gap-2.5 rounded-[10px] border p-4"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                to={`/story/${s.story_id}`}
                className="text-[17px] font-semibold hover:underline"
                style={{ ...serif, color: "var(--ink)" }}
              >
                {decodeEntities(s.story_title)}
              </Link>
              <div className="flex items-center gap-2" style={{ ...mono, fontSize: "10.5px", letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: statusColor[s.story_status] ?? "var(--ink-muted)" }} />
                <span style={{ color: statusColor[s.story_status] ?? "var(--ink-muted)", fontWeight: 600 }}>
                  {s.story_status.toUpperCase()}
                </span>
                <span>·</span>
                <span>{s.article_count} ARTICLES IN STORY</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t pt-2.5" style={{ borderColor: "var(--hair)" }}>
              <span style={{ ...mono, fontSize: 10, letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
                MATCHED ARTICLES ({s.matched_articles.length})
              </span>
              <ul className="flex flex-col gap-2">
                {s.matched_articles.slice(0, 3).map((a) => (
                  <li key={a.id} className="flex flex-col gap-1">
                    <Link
                      to={`/article/${a.id}`}
                      className="text-[13.5px] font-medium hover:underline"
                      style={{ color: "var(--ink)" }}
                    >
                      {a.title ? decodeEntities(a.title) : a.url}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2" style={{ ...mono, fontSize: 10, color: "var(--ink-muted)" }}>
                      <span>{a.outlet} · {a.published_at}</span>
                      {a.bias_label && (
                        <>
                          <span>·</span>
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase" style={{ letterSpacing: "0.08em", ...chip(a.bias_label) }}>
                            {a.bias_label}
                          </span>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
