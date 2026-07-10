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

const mono = { fontFamily: "var(--font-mono)" } as const;
const serif = { fontFamily: "var(--font-serif)" } as const;

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
    "flex flex-col overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--surface-1)] shadow-[0_1px_3px_var(--card-shadow)] transition-colors hover:bg-black/[0.02]";

  const menu = (
    <div className="absolute right-2.5 top-2.5 z-[1]">
      <StoryMenu storyId={card.id} onLess={onLess} />
    </div>
  );

  if (card.size === "compact") {
    return (
      <div className="relative">
        {menu}
        <Link to={`/story/${card.id}`} className={`${shell} gap-1.5 p-3.5`}>
          <MetaLine s={card} />
          <h2
            className="truncate pr-6"
            style={{ ...serif, fontSize: 15.5, fontWeight: 600, lineHeight: 1.3, color: isDead ? "var(--status-dead)" : "var(--ink)" }}
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
        <Link to={`/story/${card.id}`} className={`${shell} gap-2`}>
          <Thumb src={card.image_url} dead={isDead} className="h-[120px] w-full shrink-0 object-cover" />
          <div className="flex flex-col gap-1.5 p-3.5">
            <MetaLine s={card} />
            <h2 style={{ ...serif, fontSize: 18, fontWeight: 600, lineHeight: 1.25, color: isDead ? "var(--status-dead)" : "var(--ink)" }}>
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
      <Link to={`/story/${card.id}`} className={`${shell} gap-2.5`}>
        <Thumb src={card.image_url} dead={isDead} className="h-[180px] w-full shrink-0 object-cover" />
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2">
            {card.category && (
              <span
                className="rounded px-2 py-0.5 text-[9px] font-semibold uppercase"
                style={{ ...mono, letterSpacing: "0.08em", background: "var(--chip-center-bg)", color: "var(--chip-center-ink)" }}
              >
                {card.category.replace("_", " ")}
              </span>
            )}
            <MetaLine s={card} />
          </div>
          <h2 style={{ ...serif, fontSize: 22, fontWeight: 700, lineHeight: 1.22, color: isDead ? "var(--status-dead)" : "var(--ink)" }}>
            {decodeEntities(card.title)}
          </h2>
          <div className="flex items-center justify-between" style={{ opacity: isDead ? 0.7 : 1 }}>
            <LeanBar left={card.bias_left_share} center={card.bias_center_share} right={card.bias_right_share} />
            <Sparkline counts={card.daily_counts} />
          </div>
          {card.matched.length > 0 && (
            <div className="flex flex-wrap gap-1.5" style={{ ...mono, fontSize: 9.5, letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
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
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set());
  const { data: countries } = useQuery({ queryKey: ["countries"], queryFn: fetchCountries });
  const queryKey = ["foryou", filters.country, filters.mode];
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
    // resync with the server's own "less"-filtered ranking on next load
    queryClient.invalidateQueries({ queryKey: ["foryou"] });
  }

  if (isLoading) return <Loading label="Loading your feed…" />;
  if (error) return <p className="p-8 text-red-700">Failed to load your feed.</p>;

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
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-2 sm:px-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 style={{ ...serif, fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>
          Good {greeting()}, {me?.display_name ?? "there"}
        </h1>
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
          RANKED FOR YOU · {cards.length} STORIES
        </span>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {showEmptyState && selectedCountry ? (
        <CountryEmptyState countryName={selectedCountry.name} />
      ) : (
        <div className="flex gap-4">
          {columns.map((col, i) => (
            <div key={i} className="flex min-w-0 flex-1 flex-col gap-4">
              {col.map((card) => (
                <Card key={card.id} card={card} onLess={() => hide(card.id)} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
