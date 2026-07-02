import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchStories } from "../api";
import Sparkline from "../components/Sparkline";

const statusColor: Record<string, string> = {
  active: "var(--status-active)",
  fading: "var(--status-fading)",
  dead: "var(--status-dead)",
};

/** Compact lean summary: one dot colored by the dominant lean + shares. */
function LeanDot({
  left,
  center,
  right,
}: {
  left: number | null;
  center: number | null;
  right: number | null;
}) {
  const l = left ?? 0;
  const c = center ?? 0;
  const r = right ?? 0;
  if (l + c + r === 0) return null;
  const dominant = Math.max(l, c, r);
  const color =
    dominant === c ? "var(--surface-1)" : dominant === l ? "var(--bias-left)" : "var(--bias-right)";
  const pct = (v: number) => Math.round(v * 100);
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color, border: "1px solid var(--baseline)" }}
        aria-hidden
      />
      <span>
        {pct(l)}% L · {pct(c)}% C · {pct(r)}% R
      </span>
    </span>
  );
}

export default function Feed() {
  const { data: stories, isLoading, error } = useQuery({
    queryKey: ["stories"],
    queryFn: fetchStories,
  });

  if (isLoading) return <p className="p-8" style={{ color: "var(--ink-muted)" }}>Loading stories…</p>;
  if (error) return <p className="p-8 text-red-700">Failed to load stories.</p>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex flex-col gap-3">
        {stories?.map((s) => (
          <Link
            key={s.id}
            to={`/story/${s.id}`}
            className="block rounded-lg border px-4 py-3 transition-shadow hover:shadow-md"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: "var(--ink-2)" }}>
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: statusColor[s.status] }}
                    aria-hidden
                  />
                  <span className="uppercase tracking-wide">{s.status}</span>
                  <span>· {s.article_count} articles</span>
                  <span>·</span>
                  <LeanDot
                    left={s.bias_left_share}
                    center={s.bias_center_share}
                    right={s.bias_right_share}
                  />
                </div>
                <h2 className="truncate font-semibold">{s.title}</h2>
              </div>
              <Sparkline counts={s.daily_counts} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
