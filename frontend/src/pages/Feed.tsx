import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchStories } from "../api";
import BiasBar from "../components/BiasBar";
import Sparkline from "../components/Sparkline";

const statusColor: Record<string, string> = {
  active: "var(--status-active)",
  fading: "var(--status-fading)",
  dead: "var(--status-dead)",
};

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
            className="block rounded-lg border p-4 transition-shadow hover:shadow-md"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-xs" style={{ color: "var(--ink-2)" }}>
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: statusColor[s.status] }}
                    aria-hidden
                  />
                  <span className="uppercase tracking-wide">{s.status}</span>
                  <span>· {s.article_count} articles</span>
                  <span>· {s.first_seen} → {s.last_seen}</span>
                </div>
                <h2 className="truncate font-semibold">{s.title}</h2>
              </div>
              <Sparkline counts={s.daily_counts} />
            </div>
            <div className="mt-3">
              <BiasBar
                left={s.bias_left_share}
                center={s.bias_center_share}
                right={s.bias_right_share}
              />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
