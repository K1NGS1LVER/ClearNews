/** Tiny inline lifecycle bar chart for story cards. Pure SVG, no axes. */
export default function Sparkline({ counts }: { counts: number[] }) {
  const w = 120;
  const h = 28;
  const max = Math.max(...counts, 1);
  const barW = Math.min(12, Math.max(2, Math.floor(w / counts.length) - 2));
  return (
    <svg width={w} height={h} aria-label="Daily coverage volume">
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
