import { withErrorBoundary } from "./ErrorBoundary";

/** Tiny inline lifecycle bar chart for story cards. Pure SVG, no axes.
    Hidden until the story spans at least two days - a single bar reads
    as a rendering artifact, not a chart. */
function Sparkline({ counts }: { counts: number[] }) {
  if (counts.length < 2) return null;
  const w = 120;
  const h = 28;
  const max = Math.max(...counts, 1);
  const barW = Math.min(12, Math.max(2, Math.floor(w / counts.length) - 2));
  return (
    <svg width={w} height={h} className="shrink-0" aria-label="Daily coverage volume">
      {counts.map((v, i) => {
        const barH = Math.max(2, (v / max) * h);
        return (
          <rect
            key={i}
            x={w - (counts.length - i) * (barW + 2)}
            y={h - barH}
            width={barW}
            height={barH}
            rx={1.5}
            fill="var(--series-volume)"
          />
        );
      })}
    </svg>
  );
}

export default withErrorBoundary(Sparkline, "Sparkline");
