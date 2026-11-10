import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { decodeEntities, fetchStories, searchStories } from "../api";
import { LeanBar, MetaLine } from "../components/StoryBits";
import { useUrlStringState } from "../hooks/useUrlState";
import { useScrollRestoration } from "../hooks/usePageState";

const mono = { fontFamily: "var(--font-outlier)" } as const;

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

/* Focus and active state helpers for Hallmark Floor 26a & Reflex 26b */
const focusStyle = {
  outline: "2px solid var(--color-focus)",
  outlineOffset: "2px",
} as const;

const pressSpringStyle = {
  transform: "translateY(3px)",
  transition: "transform var(--dur-micro) var(--ease-out)",
} as const;

const pressSpringMicroStyle = {
  transform: "translateY(2px)",
  transition: "transform var(--dur-micro) var(--ease-out)",
} as const;

export default function Search() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useUrlStringState("q", "");
  useScrollRestoration("search");

  useEffect(() => {
    setInput(query);
  }, [query]);

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
    <div style={{ minHeight: "100vh", background: "var(--color-paper)", color: "var(--color-ink)" }}>
      <section style={{ paddingTop: "var(--space-xl)", paddingBottom: "var(--space-xl)" }}>
        <div className="container">
          <form
            style={{ display: "flex", gap: "var(--space-md)", marginBottom: "var(--space-2xl)" }}
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(input);
            }}
          >
            <div
              style={{
                display: "flex",
                flex: 1,
                alignItems: "center",
                gap: "var(--space-md)",
                padding: "var(--space-sm) var(--space-lg)",
                borderRadius: "var(--radius-input)",
                border: "1.5px solid var(--color-ink)",
                background: "var(--color-paper)",
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="diplomatic talks that eased oil prices…"
                style={{
                  minWidth: 0,
                  flex: 1,
                  background: "transparent",
                  fontSize: "var(--text-sm)",
                  fontFamily: "var(--font-body)",
                  color: "var(--color-ink)",
                  border: "none",
                  outline: "none",
                }}
              />
              <span style={{ display: "none", ...mono, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                SEMANTIC · MEANING, NOT KEYWORDS
              </span>
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isFetching}
              style={{
                ...mono,
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                padding: "var(--space-sm) var(--space-xl)",
                borderRadius: "var(--radius-input)",
                background: "var(--color-ink)",
                color: "var(--color-paper)",
                border: "none",
                cursor: "pointer",
                transition: "transform var(--dur-micro) var(--ease-out), box-shadow var(--dur-micro) var(--ease-out)",
                boxShadow: "inset 0 1px 0 var(--glint), 0 0 0 1px var(--color-rule), 0 3px 0 var(--color-rule)",
              }}
              onMouseDown={(e) => Object.assign(e.currentTarget.style, pressSpringStyle)}
              onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
              onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
              onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
            >
              {isFetching ? "Searching…" : "Search"}
            </button>
          </form>

          {/* When no search is active, display curated topics & popular opinions */}
          {!query && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2xl)" }}>
              <div>
                <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.12em", color: "var(--color-accent)", textTransform: "uppercase", display: "block", marginBottom: "var(--space-md)" }}>
                  SUGGESTED PERSPECTIVES · MAJOR OPINION DEBATES
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)" }}>
                  {SUGGESTED_QUERIES.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleSearch(suggestion)}
                      style={{
                        ...mono,
                        fontSize: "var(--text-sm)",
                        fontWeight: 500,
                        padding: "var(--space-xs) var(--space-md)",
                        borderRadius: "var(--radius-pill)",
                        border: "1px solid var(--color-rule)",
                        background: "var(--color-paper)",
                        color: "var(--color-ink)",
                        cursor: "pointer",
                        transition: "transform var(--dur-micro) var(--ease-out), background var(--dur-micro) var(--ease-out), border-color var(--dur-micro) var(--ease-out)",
                      }}
                      onMouseDown={(e) => Object.assign(e.currentTarget.style, pressSpringMicroStyle)}
                      onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                      onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                      onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
                    >
                      <span style={{ color: "var(--color-accent)", marginRight: "var(--space-xs)" }}>⌕</span>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              {popularStories && popularStories.length > 0 && (
                <div style={{ paddingTop: "var(--space-xl)", borderTop: "1px solid var(--color-rule)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-lg)" }}>
                    <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
                      POPULAR STORIES ACROSS PERSPECTIVES
                    </span>
                    <span style={{ ...mono, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                      POLITICAL DIVERSITY
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--space-md)" }}>
                      {popularStories.map((story) => (
                      <article
                        key={story.id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "var(--space-sm)",
                          padding: "var(--space-lg)",
                          background: "var(--color-paper)",
                          border: "1px solid var(--color-rule)",
                          borderRadius: "var(--radius-card)",
                          boxShadow: "var(--shadow-card)",
                          transition: "transform var(--dur-short) var(--ease-out), box-shadow var(--dur-short) var(--ease-out), border-color var(--dur-short) var(--ease-out)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "translateY(-4px)";
                          e.currentTarget.style.boxShadow = "var(--shadow-lift)";
                          e.currentTarget.style.borderColor = "var(--color-accent)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "var(--shadow-card)";
                          e.currentTarget.style.borderColor = "var(--color-rule)";
                        }}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                          <MetaLine s={story} />
                          <Link
                            to={`/story/${story.id}`}
                            style={{
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              fontSize: "var(--text-base)",
                              fontWeight: 600,
                              lineHeight: 1.3,
                              color: "var(--color-ink)",
                              textDecoration: "none",
                              transition: "text-decoration var(--dur-micro) var(--ease-out)",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                            onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                            onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
                          >
                            {decodeEntities(story.agent_headline || story.title)}
                          </Link>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "var(--space-md)", borderTop: "1px solid var(--color-rule)" }}>
                          <LeanBar left={story.bias_left_share} center={story.bias_center_share} right={story.bias_right_share} />
                          <button
                            type="button"
                            onClick={() => handleSearch(decodeEntities(story.agent_headline || story.title))}
                            style={{
                              ...mono,
                              fontSize: "var(--text-xs)",
                              fontWeight: 500,
                              color: "var(--color-muted)",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              textDecoration: "underline",
                              textDecorationStyle: "dotted",
                              transition: "color var(--dur-micro) var(--ease-out)",
                            }}
                            title="Search related coverage"
                            onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                            onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
                          >
                            SEARCH ⌕
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search results view */}
          {data && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-lg)" }}>
              <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.06em", color: "var(--color-muted)" }}>
                {data.length} STORY MATCH{data.length === 1 ? "" : "ES"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setInput("");
                }}
                style={{
                  ...mono,
                  fontSize: "var(--text-xs)",
                  fontWeight: 500,
                  color: "var(--color-muted)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                  textDecorationStyle: "dotted",
                  transition: "color var(--dur-micro) var(--ease-out)",
                }}
                onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
              >
                Clear search ✕
              </button>
            </div>
          )}
          {data && data.length === 0 && (
            <p style={{ marginTop: "var(--space-md)", fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
              No matches found for "{query}".
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)", marginTop: "var(--space-xl)" }}>
            {data?.map((s) => (
              <section
                key={s.story_id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-sm)",
                  padding: "var(--space-lg)",
                  background: "var(--color-paper)",
                  border: "1px solid var(--color-rule)",
                  borderRadius: "var(--radius-card)",
                  boxShadow: "var(--shadow-card)",
                  transition: "transform var(--dur-short) var(--ease-out), box-shadow var(--dur-short) var(--ease-out), border-color var(--dur-short) var(--ease-out)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow = "var(--shadow-lift)";
                  e.currentTarget.style.borderColor = "var(--color-accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "var(--shadow-card)";
                  e.currentTarget.style.borderColor = "var(--color-rule)";
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "var(--space-md)" }}>
                  <Link
                    to={`/story/${s.story_id}`}
                    style={{
                      fontSize: "var(--text-title)",
                      fontWeight: 700,
                      lineHeight: 1.2,
                      letterSpacing: "-0.01em",
                      color: "var(--color-ink)",
                      textDecoration: "none",
                      transition: "text-decoration var(--dur-micro) var(--ease-out)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                    onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                    onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
                  >
                    {decodeEntities(s.story_title)}
                  </Link>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.06em", color: "var(--color-muted)" }}>
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: statusColor[s.story_status] ?? "var(--color-muted)" }} />
                    <span style={{ color: statusColor[s.story_status] ?? "var(--color-muted)", fontWeight: 600 }}>
                      {s.story_status.toUpperCase()}
                    </span>
                    <span>·</span>
                    <span>{s.article_count} ARTICLES IN STORY</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", paddingTop: "var(--space-md)", borderTop: "1px solid var(--color-rule)" }}>
                  <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.06em", color: "var(--color-muted)" }}>
                    MATCHED ARTICLES ({s.matched_articles.length})
                  </span>
                  <ul style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                    {s.matched_articles.slice(0, 3).map((a) => (
                      <li key={a.id} style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                        <Link
                          to={`/article/${a.id}`}
                          style={{
                            fontSize: "var(--text-sm)",
                            fontWeight: 500,
                            color: "var(--color-ink)",
                            textDecoration: "none",
                            transition: "text-decoration var(--dur-micro) var(--ease-out)",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                          onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                          onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
                        >
                          {a.title ? decodeEntities(a.title) : a.url}
                        </Link>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-md)", ...mono, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                          <span>{a.outlet} · {a.published_at}</span>
                          {a.bias_label && (
                            <>
                              <span>·</span>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "var(--space-2xs) var(--space-xs)",
                                  fontSize: "9px",
                                  fontWeight: 700,
                                  letterSpacing: "0.08em",
                                  textTransform: "uppercase",
                                  borderRadius: "var(--radius-input)",
                                  ...chip(a.bias_label),
                                }}
                              >
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
      </section>
    </div>
  );
}