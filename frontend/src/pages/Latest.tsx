import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { decodeEntities, type ArticleOut } from "../api";
import Loading from "../components/Loading";

const mono = { fontFamily: "var(--font-mono)" } as const;

const chip = (label: string | null) => ({
  background: label === "left" ? "var(--bias-left)" : label === "right" ? "var(--bias-right)" : "var(--chip-center-bg)",
  color: label === "center" || !label ? "var(--chip-center-ink)" : "#fff",
});

function dayLabel(iso: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const weekday = new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (iso === today) return `TODAY · ${weekday}`.toUpperCase();
  if (iso === yesterday) return `YESTERDAY · ${weekday}`.toUpperCase();
  return weekday.toUpperCase();
}

/** Plain reading feed: newest articles grouped by day, click a headline to
    read in-app. */
export default function Latest() {
  const { data: articles, isLoading } = useQuery<ArticleOut[]>({
    queryKey: ["latest"],
    queryFn: () => fetch("/api/articles?limit=100").then((r) => r.json()),
  });

  if (isLoading)
    return <Loading label="Loading latest news…" />;

  const days: { day: string; items: ArticleOut[] }[] = [];
  for (const a of articles ?? []) {
    const group = days[days.length - 1];
    if (group?.day === a.published_at) group.items.push(a);
    else days.push({ day: a.published_at, items: [a] });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-2 sm:px-8">
      {days.map((group, gi) => (
        <div key={group.day} className="flex flex-col">
          <span
            className="pb-2.5"
            style={{
              ...mono,
              fontSize: 10,
              letterSpacing: "0.12em",
              color: "var(--ink-muted)",
              borderBottom: "2px solid var(--ink)",
              paddingTop: gi === 0 ? 0 : 20,
            }}
          >
            {dayLabel(group.day)}
          </span>
          {group.items.map((a, i) => (
            <Link
              key={a.id}
              to={`/article/${a.id}`}
              className="flex items-baseline gap-3.5 py-3"
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--rowline)" }}
            >
              {a.bias_label ? (
                <span
                  className="w-11 shrink-0 rounded py-0.5 text-center text-[9px] font-semibold uppercase"
                  style={{ ...mono, letterSpacing: "0.08em", ...chip(a.bias_label) }}
                >
                  {a.bias_label === "center" ? "CENTR" : a.bias_label}
                </span>
              ) : (
                <span className="w-11 shrink-0" />
              )}
              <span className="min-w-0 flex-1 text-[14.5px] font-medium leading-snug" style={{ color: "var(--ink)" }}>
                {decodeEntities(a.title ?? "")}
              </span>
              <span className="shrink-0" style={{ ...mono, fontSize: 10, color: "var(--ink-muted)" }}>
                {a.outlet}
              </span>
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}
