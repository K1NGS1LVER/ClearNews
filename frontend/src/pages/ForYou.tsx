import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { decodeEntities, fetchCountries, fetchForYou, type ForYouCard } from "../api";
import { useMe } from "../auth";
import Loading from "../components/Loading";
import Sparkline from "../components/Sparkline";
import { LeanBar, MetaLine, Thumb } from "../components/StoryBits";
import StoryMenu from "../components/StoryMenu";
import FilterBar, { CountryEmptyState } from "../components/FilterBar";
import { DEFAULT_FILTERS, type Filters } from "../lib/filters";
import { useUrlState } from "../hooks/useUrlState";
import { useScrollRestoration } from "../hooks/usePageState";

const mono = { fontFamily: "var(--font-outlier)" } as const;
const display = { fontFamily: "var(--font-display)" } as const;

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

const breakpoints = [
  { query: "(min-width: 1024px)", columns: 3 },
  { query: "(min-width: 640px)", columns: 2 },
];

function subscribe(callback: () => void) {
  const mqls = breakpoints.map((b) => window.matchMedia(b.query));
  mqls.forEach((mql) => mql.addEventListener("change", callback));
  return () => mqls.forEach((mql) => mql.removeEventListener("change", callback));
}

function getColumnCount() {
  for (const b of breakpoints) {
    if (window.matchMedia(b.query).matches) return b.columns;
  }
  return 1;
}

function useColumns() {
  return useSyncExternalStore(subscribe, getColumnCount, () => 1);
}

function Card({ card, onLess }: { card: ForYouCard; onLess: () => void }) {
  const isDead = card.status === "dead";
  const shell =
    "flex flex-col overflow-hidden rounded-lg border border-[color:var(--color-rule)] bg-[var(--color-paper)] shadow-sm transition-all duration-200 ease-out";

  const menu = (
    <div className="absolute right-2.5 top-2.5 z-[1]">
      <StoryMenu storyId={card.id} onLess={onLess} />
    </div>
  );

  if (card.size === "compact") {
    return (
      <div className="relative">
        {menu}
        <Link
          to={`/story/${card.id}`}
          className={`${shell} gap-1.5 p-3.5`}
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
          <MetaLine s={card} />
          <h2
            className="truncate pr-6"
            style={{ ...display, fontSize: "var(--text-base)", fontWeight: 600, lineHeight: 1.3, color: isDead ? "var(--status-dead)" : "var(--color-ink)" }}
          >
            {decodeEntities(card.title)}
          </h2>
        </Link>
      </div>
    );
  }

  if (card.size === "standard") {
    return (
      <div className="relative">
        {menu}
        <Link
          to={`/story/${card.id}`}
          className={`${shell} gap-2`}
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
          <Thumb src={card.image_url} title={decodeEntities(card.title)} dead={isDead} className="h-[90px] w-full shrink-0 object-cover" />
          <div className="flex flex-col gap-1.5 p-3">
            <MetaLine s={card} />
            <h2 style={{ ...display, fontSize: "var(--text-base)", fontWeight: 600, lineHeight: 1.25, color: isDead ? "var(--status-dead)" : "var(--color-ink)" }}>
              {decodeEntities(card.title)}
            </h2>
            <div style={{ opacity: isDead ? 0.7 : 1 }}>
              <LeanBar left={card.bias_left_share} center={card.bias_center_share} right={card.bias_right_share} />
            </div>
          </div>
        </Link>
      </div>
    );
  }

  // hero
  return (
    <div className="relative">
      {menu}
      <Link
        to={`/story/${card.id}`}
        className={`${shell} gap-2`}
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
        <Thumb src={card.image_url} title={decodeEntities(card.title)} dead={isDead} className="h-[140px] w-full shrink-0 object-cover" />
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2">
            {card.category && (
              <span
                className="rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase"
                style={{ ...mono, letterSpacing: "0.08em", background: "var(--chip-center-bg)", color: "var(--chip-center-ink)", borderRadius: "var(--radius-input)" }}
              >
                {card.category.replace("_", " ")}
              </span>
            )}
            <MetaLine s={card} />
          </div>
          <h2 style={{ ...display, fontSize: "var(--text-lg)", fontWeight: 700, lineHeight: 1.22, color: isDead ? "var(--status-dead)" : "var(--color-ink)" }}>
            {decodeEntities(card.title)}
          </h2>
          <div className="flex items-center justify-between" style={{ opacity: isDead ? 0.7 : 1 }}>
            <LeanBar left={card.bias_left_share} center={card.bias_center_share} right={card.bias_right_share} />
            <Sparkline counts={card.daily_counts} />
          </div>
          {card.matched.length > 0 && (
            <div className="flex flex-wrap gap-1.5" style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.06em", color: "var(--color-muted)" }}>
              {card.matched.map((kw) => (
                <span key={kw}>MATCHED: {kw.toUpperCase()}</span>
              ))}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}

export default function ForYou() {
  const { data: me } = useMe();
  const columnCount = useColumns();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useUrlState<Filters>("filters", DEFAULT_FILTERS, {
    serialize: serializeFilters,
    deserialize: deserializeFilters,
  });
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const { data: countries } = useQuery({ queryKey: ["countries"], queryFn: fetchCountries });
  const queryKey = ["foryou", filters.country, filters.mode];
  useScrollRestoration("foryou");
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      fetchForYou({
        source_country: filters.mode === "source" ? (filters.country ?? undefined) : undefined,
        about_country: filters.mode === "about" ? (filters.country ?? undefined) : undefined,
      }),
  });

  const cards = useMemo(() => (data ?? []).filter((c) => !hiddenIds.has(c.id)), [data, hiddenIds]);

  function hide(id: number) {
    setHiddenIds((prev) => new Set(prev).add(id));
    queryClient.invalidateQueries({ queryKey: ["foryou"] });
  }

  if (isLoading) return <Loading label="Loading your feed…" />;
  if (error) return <p style={{ padding: "var(--space-xl)", color: "var(--bias-right)" }}>Failed to load your feed.</p>;

  const selectedCountry = countries?.find((c) => c.code === filters.country);
  const showEmptyState =
    filters.country &&
    cards.length === 0 &&
    selectedCountry &&
    selectedCountry.source_article_count === 0 &&
    selectedCountry.story_count === 0;

  const columns: ForYouCard[][] = Array.from({ length: columnCount }, (_, i) =>
    cards.filter((_, j) => j % columnCount === i),
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-paper)", color: "var(--color-ink)" }}>
      <section style={{ paddingTop: "var(--space-xl)", paddingBottom: "var(--space-lg)" }}>
        <div className="container" style={{ display: "flex", alignItems: "baseline", justifyContent: "spaceBetween", flexWrap: "wrap", gap: "var(--space-md)" }}>
          <h1 style={{ ...display, fontSize: "var(--text-section)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--color-ink)" }}>
            Good {greeting()}, {me?.display_name ?? "there"}
          </h1>
          <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.06em", color: "var(--color-muted)" }}>
            RANKED FOR YOU · {cards.length} STORIES
          </span>
        </div>
      </section>

      <section style={{ paddingBottom: "var(--space-xl)" }}>
        <div className="container">
          <FilterBar filters={filters} onChange={setFilters} />
        </div>
      </section>

      <section style={{ paddingBottom: "var(--section-gap)" }}>
        <div className="container">
          {showEmptyState && selectedCountry ? (
            <CountryEmptyState countryName={selectedCountry.name} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${columnCount}, 1fr)`, gap: "var(--gap-columns)" }}>
              {columns.map((col, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
                  {col.map((card) => (
                    <Card key={card.id} card={card} onLess={() => hide(card.id)} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}