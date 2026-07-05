import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { decodeEntities, fetchForYou, type ForYouCard } from "../api";
import { useMe } from "../auth";
import Loading from "../components/Loading";
import Sparkline from "../components/Sparkline";
import { LeanBar, MetaLine, Thumb } from "../components/StoryBits";

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

function Card({ card }: { card: ForYouCard }) {
  const isDead = card.status === "dead";
  const shell =
    "flex flex-col overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--surface-1)] shadow-[0_1px_3px_var(--card-shadow)] transition-colors hover:bg-black/[0.02]";

  if (card.size === "compact") {
    return (
      <Link to={`/story/${card.id}`} className={`${shell} gap-1.5 p-3.5`}>
        <MetaLine s={card} />
        <h2
          className="truncate"
          style={{ ...serif, fontSize: 15.5, fontWeight: 600, lineHeight: 1.3, color: isDead ? "var(--status-dead)" : "var(--ink)" }}
        >
          {decodeEntities(card.title)}
        </h2>
      </Link>
    );
  }

  if (card.size === "standard") {
    return (
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
    );
  }

  // hero
  return (
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
  );
}

export default function ForYou() {
  const { data: me } = useMe();
  const columnCount = useColumns();
  const { data: cards, isLoading, error } = useQuery({
    queryKey: ["foryou"],
    queryFn: fetchForYou,
  });

  if (isLoading) return <Loading label="Loading your feed…" />;
  if (error) return <p className="p-8 text-red-700">Failed to load your feed.</p>;

  const columns: ForYouCard[][] = Array.from({ length: columnCount }, (_, i) =>
    (cards ?? []).filter((_, j) => j % columnCount === i),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-8 pt-2 sm:px-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 style={{ ...serif, fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>
          Good {greeting()}, {me?.display_name ?? "there"}
        </h1>
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
          RANKED FOR YOU · {cards?.length ?? 0} STORIES
        </span>
      </div>

      <div className="flex gap-4">
        {columns.map((col, i) => (
          <div key={i} className="flex flex-1 flex-col gap-4">
            {col.map((card) => (
              <Card key={card.id} card={card} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
