import { useState } from "react";
import type { StoryCard } from "../api";
import { withErrorBoundary } from "./ErrorBoundary";

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
function MetaLineComponent({ s }: { s: StoryCard }) {
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
function LeanBarComponent({ left, center, right }: { left: number | null; center: number | null; right: number | null }) {
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

function ThumbComponent({ src, dead, className }: { src: string | null; dead?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  const cls = className ?? "h-[110px] w-full shrink-0 object-cover sm:ml-5 sm:my-3.5 sm:h-[66px] sm:w-24 sm:rounded-md";
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        className={cls}
        style={{ opacity: dead ? 0.6 : 1 }}
        aria-hidden
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      className={`${cls} flex items-center justify-center`}
      style={{ opacity: dead ? 0.6 : 1, background: "var(--thumb-a)" }}
      role="img"
      aria-label="No image available"
    >
      <svg
        width="30%"
        height="30%"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ink-muted)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ minWidth: 18, minHeight: 18, maxWidth: 32, maxHeight: 32 }}
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="M21 16l-5.5-5.5a2 2 0 0 0-2.8 0L6 17" />
        <line x1="3" y1="3" x2="21" y2="21" />
      </svg>
    </div>
  );
}

export const MetaLine = withErrorBoundary(MetaLineComponent, "MetaLine");
export const LeanBar = withErrorBoundary(LeanBarComponent, "LeanBar");
export const Thumb = withErrorBoundary(ThumbComponent, "Thumb");
