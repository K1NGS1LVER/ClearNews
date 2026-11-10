import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { decodeEntities, fetchCountries, fetchStories } from "../api";
import Loading from "../components/Loading";
import Sparkline from "../components/Sparkline";
import { LeanBar, MetaLine, Thumb } from "../components/StoryBits";
import FilterBar, { CountryEmptyState } from "../components/FilterBar";
import { DEFAULT_FILTERS, type Filters } from "../lib/filters";
import { useUrlState } from "../hooks/useUrlState";
import { useScrollRestoration } from "../hooks/usePageState";

const PAGE_SIZE = 60;

const mono = { fontFamily: "var(--font-outlier)" } as const;
const display = { fontFamily: "var(--font-display)" } as const;

const focusStyle = {
  outline: "2px solid var(--color-focus)",
  outlineOffset: "2px",
} as const;

const pressSpringStyle = {
  transform: "translateY(3px)",
  transition: "transform var(--dur-micro) var(--ease-out)",
} as const;

function serializeFilters(filters: Filters): string {
  return JSON.stringify(filters);
}

function deserializeFilters(value: string): Filters {
  try {
    const parsed = JSON.parse(value);
    return {
      country: parsed.country ?? null,
      mode: parsed.mode ?? "source",
      status: parsed.status ?? "active",
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export default function Feed() {
  const [filters, setFilters] = useUrlState<Filters>("filters", DEFAULT_FILTERS, {
    serialize: serializeFilters,
    deserialize: deserializeFilters,
  });
  const { data: countries } = useQuery({ queryKey: ["countries"], queryFn: fetchCountries });
  useScrollRestoration("feed");
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["stories", filters],
    queryFn: ({ pageParam }) =>
      fetchStories({
        status: filters.status ?? undefined,
        source_country: filters.mode === "source" ? (filters.country ?? undefined) : undefined,
        about_country: filters.mode === "about" ? (filters.country ?? undefined) : undefined,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.flat().length : undefined,
  });

  const stories = data?.pages.flat() ?? [];

  if (isLoading) return <Loading label="Loading stories…" />;
  if (error) return <p style={{ padding: "var(--space-xl)", color: "var(--bias-right)" }}>Failed to load stories.</p>;

  const liveCount = stories.filter((s) => s.status !== "dead").length;
  const selectedCountry = countries?.find((c) => c.code === filters.country);
  const showEmptyState =
    filters.country &&
    stories?.length === 0 &&
    selectedCountry &&
    selectedCountry.source_article_count === 0 &&
    selectedCountry.story_count === 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-paper)", color: "var(--color-ink)" }}>
      <section style={{ paddingTop: "var(--space-xl)", paddingBottom: "var(--space-lg)" }}>
        <div className="container">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-md)", marginBottom: "var(--space-xl)" }}>
            <h1 style={{ ...display, fontSize: "var(--text-section)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--color-ink)" }}>
              Tracking {liveCount} live stories
            </h1>
          </div>
          <FilterBar filters={filters} onChange={setFilters} showStatus />
        </div>
      </section>

      <section style={{ paddingBottom: "var(--section-gap)" }}>
        <div className="container">
          {showEmptyState && selectedCountry ? (
            <CountryEmptyState countryName={selectedCountry.name} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              {stories?.map((s) => (
                <Link
                  key={s.id}
                  to={`/story/${s.id}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-sm)",
                    padding: "var(--space-lg)",
                    background: "var(--color-paper)",
                    border: "1px solid var(--color-rule)",
                    borderRadius: "var(--radius-card)",
                    boxShadow: "var(--shadow-card)",
                    textDecoration: "none",
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
                  onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                  onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
                >
                  <div style={{ display: "flex", gap: "var(--space-lg)" }}>
                    <Thumb src={s.image_url} title={decodeEntities(s.title)} dead={s.status === "dead"} />
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", minWidth: 0, flex: 1 }}>
                      <MetaLine s={s} />
                      <h2
                        style={{
                          ...display,
                          fontSize: "var(--text-title)",
                          fontWeight: 700,
                          lineHeight: 1.2,
                          letterSpacing: "-0.01em",
                          color: s.status === "dead" ? "var(--status-dead)" : "var(--color-ink)",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {decodeEntities(s.agent_headline || s.title)}
                      </h2>
                      <div style={{ opacity: s.status === "dead" ? 0.7 : 1 }}>
                        <LeanBar left={s.bias_left_share} center={s.bias_center_share} right={s.bias_right_share} />
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, opacity: s.status === "dead" ? 0.5 : 1 }}>
                      <Sparkline counts={s.daily_counts} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {hasNextPage && !showEmptyState && (
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              style={{
                marginTop: "var(--space-xl)",
                width: "100%",
                ...mono,
                fontSize: "var(--text-sm)",
                fontWeight: 500,
                padding: "var(--space-sm) var(--space-xl)",
                borderRadius: "var(--radius-input)",
                border: "1px solid var(--color-rule)",
                background: "var(--color-paper)",
                color: isFetchingNextPage ? "var(--color-muted)" : "var(--color-ink-2)",
                cursor: isFetchingNextPage ? "default" : "pointer",
                opacity: isFetchingNextPage ? 0.6 : 1,
                transition: "opacity var(--dur-micro) var(--ease-out), transform var(--dur-micro) var(--ease-out), box-shadow var(--dur-micro) var(--ease-out)",
                boxShadow: "inset 0 1px 0 var(--glint), 0 0 0 1px var(--color-rule), 0 3px 0 var(--color-rule)",
              }}
              onMouseDown={(e) => { if (!isFetchingNextPage) Object.assign(e.currentTarget.style, pressSpringStyle); }}
              onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
              onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
              onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
            >
              {isFetchingNextPage ? "Loading…" : "LOAD MORE"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}