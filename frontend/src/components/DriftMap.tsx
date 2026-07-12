import { useQuery } from "@tanstack/react-query";
import { scaleLinear } from "d3";
import { useState } from "react";
import { withErrorBoundary } from "./ErrorBoundary";
import Loading from "./Loading";

type DriftPoint = {
  article_id: number;
  title: string | null;
  outlet: string;
  day: string;
  bias_label: string | null;
  x: number;
  y: number;
};

type Drift = { points: DriftPoint[]; trajectory: { day: string; x: number; y: number }[] };

const biasColor = (label: string | null) =>
  label === "left" ? "var(--bias-left)" : label === "right" ? "var(--bias-right)" : "var(--baseline)";

const W = 720;
const H = 340;
const PAD = 24;

/** Articles in 2D embedding space; the line is the daily narrative centroid.
    A straight line = stable framing, a bend = the story pivoted. */
function DriftMap({ storyId }: { storyId: number }) {
  const { data } = useQuery<Drift>({
    queryKey: ["drift", storyId],
    queryFn: () => fetch(`/api/stories/${storyId}/drift`).then((r) => r.json()),
  });
  const [hover, setHover] = useState<DriftPoint | null>(null);

  if (!data) return <Loading label="Loading map…" compact />;
  if (data.points.length < 2)
    return <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Not enough articles to map.</p>;

  const xs = data.points.map((p) => p.x);
  const ys = data.points.map((p) => p.y);
  const sx = scaleLinear([Math.min(...xs), Math.max(...xs)], [PAD, W - PAD]);
  const sy = scaleLinear([Math.min(...ys), Math.max(...ys)], [H - PAD, PAD]);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Narrative drift map">
        {data.trajectory.length > 1 && (
          <polyline
            points={data.trajectory.map((t) => `${sx(t.x)},${sy(t.y)}`).join(" ")}
            fill="none"
            stroke="var(--series-drift)"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}
        {data.trajectory.map((t, i) => (
          <g key={t.day}>
            <circle cx={sx(t.x)} cy={sy(t.y)} r={5} fill="var(--series-drift)" stroke="var(--surface-1)" strokeWidth={2} />
            <text x={sx(t.x) + 8} y={sy(t.y) - 6} fontSize={10} fill="var(--ink-2)">
              {i === 0 || i === data.trajectory.length - 1 ? t.day : ""}
            </text>
          </g>
        ))}
        {data.points.map((p) => (
          <circle
            key={p.article_id}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={hover?.article_id === p.article_id ? 7 : 4.5}
            fill={biasColor(p.bias_label)}
            fillOpacity={0.75}
            stroke="var(--surface-1)"
            strokeWidth={1.5}
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      <div
        className="mt-1.5 flex flex-wrap items-center gap-4"
        style={{ fontFamily: "var(--font-mono)", fontSize: "9.5px", letterSpacing: "0.04em", color: "var(--ink-muted)" }}
      >
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: "var(--bias-left)" }} /> LEFT</span>
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: "var(--baseline)" }} /> CENTER</span>
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: "var(--bias-right)" }} /> RIGHT</span>
        <span><span className="mr-1.5 inline-block h-0.5 w-4 align-middle" style={{ background: "var(--series-drift)" }} /> DAILY CENTROID PATH</span>
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute left-2 top-2 max-w-xs rounded border px-2 py-1 text-xs shadow-sm"
          style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
        >
          <div className="font-medium">{hover.title ?? "(untitled)"}</div>
          <div style={{ color: "var(--ink-muted)" }}>{hover.outlet} · {hover.day} · {hover.bias_label}</div>
        </div>
      )}
    </div>
  );
}

export default withErrorBoundary(DriftMap, "DriftMap");
