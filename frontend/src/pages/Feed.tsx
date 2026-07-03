import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { decodeEntities, fetchStories, type StoryCard } from "../api";
import Sparkline from "../components/Sparkline";

const statusColor: Record<string, string> = {
  active: "var(--status-active)",
  fading: "var(--status-fading)",
  dead: "var(--status-dead)",
};

const monthDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();

function lifespanDays(firstSeen: string, lastSeen: string) {
  const ms = new Date(lastSeen).getTime() - new Date(firstSeen).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

/** Status + momentum line: dot/status/count for active & fading, a closed
    summary for dead stories (matches the dc.html "row 4 dead" treatment). */
function MetaLine({ s }: { s: StoryCard }) {
  const mono = { fontFamily: "var(--font-mono)", fontSize: "10.5px", letterSpacing: "0.06em", color: "var(--ink-muted)" };

  if (s.status === "dead") {
    return (
      <div className="flex items-center gap-2" style={mono}>
        <span className="h-[7px] w-[7px] rounded-full" style={{ background: "var(--status-dead)" }} />
        <span>DEAD · {monthDay(s.last_seen)}</span>
        <span>·</span>
        <span>{s.article_count} ARTICLES</span>
        <span>·</span>
        <span>LIVED {lifespanDays(s.first_seen, s.last_seen)} DAYS</span>
      </div>
    );
  }

  const counts = s.daily_counts;
  const last = counts[counts.length - 1] ?? 0;
  const prev = counts[counts.length - 2] ?? 0;
  const pctChange = prev > 0 ? Math.round(((last - prev) / prev) * 100) : 0;
  const trend =
    s.status === "fading"
      ? { label: `▼ ${pctChange}%`, color: "var(--status-fading)" }
      : last > prev
        ? { label: "▲ RISING", color: "var(--status-active)" }
        : { label: "— STEADY", color: "var(--ink-muted)" };

  return (
    <div className="flex items-center gap-2" style={mono}>
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: statusColor[s.status] }} />
      <span style={{ color: statusColor[s.status], fontWeight: 600 }}>{s.status.toUpperCase()}</span>
      <span>·</span>
      <span>{s.article_count} ARTICLES</span>
      <span>·</span>
      <span style={{ color: trend.color }}>{trend.label}</span>
    </div>
  );
}

/** Thin 3-segment bias bar + numeric split, sized to sit inline in a row. */
function LeanBar({ left, center, right }: { left: number | null; center: number | null; right: number | null }) {
  const l = left ?? 0;
  const c = center ?? 0;
  const r = right ?? 0;
  if (l + c + r === 0) return null;
  const pct = (v: number) => Math.round(v * 100);
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-1 w-[150px] overflow-hidden rounded-full" style={{ gap: 1.5 }}>
        <div style={{ flexGrow: l, background: "var(--bias-left)" }} />
        <div style={{ flexGrow: c, background: "var(--bias-center)" }} />
        <div style={{ flexGrow: r, background: "var(--bias-right)" }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-muted)" }}>
        {pct(l)}·{pct(c)}·{pct(r)}
      </span>
    </div>
  );
}

function Thumb({ src, dead }: { src: string | null; dead?: boolean }) {
  const [broken, setBroken] = useState(false);
  const className = "h-[110px] w-full shrink-0 object-cover sm:ml-5 sm:my-3.5 sm:h-[66px] sm:w-24 sm:rounded-md";
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        className={className}
        style={{ opacity: dead ? 0.6 : 1 }}
        aria-hidden
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className={className}
      style={{
        opacity: dead ? 0.6 : 1,
        backgroundImage: `repeating-linear-gradient(135deg, var(--thumb-a), var(--thumb-a) 7px, var(--thumb-b) 7px, var(--thumb-b) 14px)`,
      }}
      aria-hidden
    />
  );
}

export default function Feed() {
  const { data: stories, isLoading, error } = useQuery({
    queryKey: ["stories"],
    queryFn: fetchStories,
  });

  if (isLoading) return <p className="p-8" style={{ color: "var(--ink-muted)" }}>Loading stories…</p>;
  if (error) return <p className="p-8 text-red-700">Failed to load stories.</p>;

  const liveCount = stories?.filter((s) => s.status !== "dead").length ?? 0;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-8 pt-2 sm:px-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 15, fontWeight: 600, color: "var(--ink-2)" }}>
          Tracking {liveCount} live stories
        </h1>
      </div>

      <div className="flex flex-col gap-3 sm:gap-0 sm:overflow-hidden sm:rounded-[10px] sm:border sm:border-[color:var(--border)]">
        {stories?.map((s) => (
          <Link
            key={s.id}
            to={`/story/${s.id}`}
            className="flex flex-col overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--surface-1)] shadow-[0_1px_3px_var(--card-shadow)] transition-colors hover:bg-black/[0.02] sm:flex-row sm:items-center sm:gap-[18px] sm:rounded-none sm:border-0 sm:border-t sm:border-t-[color:var(--rowline)] sm:bg-transparent sm:shadow-none sm:first:border-t-0"
          >
            <Thumb src={s.image_url} dead={s.status === "dead"} />
            <div className="min-w-0 flex-1 flex flex-col gap-1.5 p-3.5 sm:p-0 sm:py-3.5 sm:pr-5">
              <MetaLine s={s} />
              <h2
                className="truncate"
                style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 18,
                  fontWeight: 600,
                  lineHeight: 1.25,
                  color: s.status === "dead" ? "var(--status-dead)" : "var(--ink)",
                }}
              >
                {decodeEntities(s.title)}
              </h2>
              <div style={{ opacity: s.status === "dead" ? 0.7 : 1 }}>
                <LeanBar left={s.bias_left_share} center={s.bias_center_share} right={s.bias_right_share} />
              </div>
            </div>
            <div className="hidden shrink-0 sm:my-3.5 sm:mr-5 sm:block" style={{ opacity: s.status === "dead" ? 0.5 : 1 }}>
              <Sparkline counts={s.daily_counts} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
