import { useState } from "react";
import type { StoryCard } from "../api";
import { withErrorBoundary } from "./ErrorBoundary";
import { classifyStoryShape, PATTERN_STYLE } from "../lib/storyShape";

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

  const pattern = classifyStoryShape(s.daily_counts);
  const patternStyle = PATTERN_STYLE[pattern];

  return (
    <div className="flex items-center gap-2" style={mono}>
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: statusColor[s.status] }} />
      <span style={{ color: statusColor[s.status], fontWeight: 600 }}>{s.status.toUpperCase()}</span>
      <span>·</span>
      <span>{s.article_count} ARTICLES</span>
      <span>·</span>
      <span style={{ color: patternStyle.color }}>{patternStyle.label}</span>
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
  // When center dominates the bar most likely reflects model uncertainty
  // rather than genuinely centrist framing. Mute the visual to avoid a
  // confident-looking stat that is really "the model couldn't decide."
  const centerDominant = c > 0.5;
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex h-1 w-[150px] overflow-hidden rounded-full"
        style={{ gap: 1.5, opacity: centerDominant ? 0.55 : 1 }}
        title={centerDominant ? "High center share — model confidence is low for many articles in this story" : undefined}
      >
        <div style={{ flexGrow: l, background: "var(--bias-left)" }} />
        <div style={{ flexGrow: c, background: "var(--bias-center)" }} />
        <div style={{ flexGrow: r, background: "var(--bias-right)" }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-muted)" }}>
        {centerDominant ? "~" : ""}{pct(l)}·{pct(c)}·{pct(r)}
      </span>
    </div>
  );
}

function ThumbComponent({
  src,
  title,
  dead,
  className,
}: {
  src: string | null;
  title: string;
  dead?: boolean;
  className?: string;
}) {
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
  // No real image and no stock-photo fallback configured (PEXELS_API_KEY is
  // optional - self-hosters shouldn't need a second API key just to get a
  // decent-looking card). A shaded card with the headline reads better than
  // an empty box or a generic "no image" icon, and needs zero extra config.
  return (
    <div
      className={`${cls} flex items-center p-3`}
      style={{ opacity: dead ? 0.6 : 1, background: "var(--thumb-a)" }}
    >
      <span
        className="line-clamp-3"
        style={{ fontFamily: "var(--font-serif)", fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: "var(--ink-2)" }}
      >
        {title}
      </span>
    </div>
  );
}

export const MetaLine = withErrorBoundary(MetaLineComponent, "MetaLine");
export const LeanBar = withErrorBoundary(LeanBarComponent, "LeanBar");
export const Thumb = withErrorBoundary(ThumbComponent, "Thumb");
