import { useQuery } from "@tanstack/react-query";
import { scaleLinear, scaleSqrt } from "d3";
import { useState } from "react";

type OutletPoint = {
  domain: string;
  mean_bias: number | null;
  articles: number;
  x: number;
  y: number;
};

const W = 720;
const H = 380;
const PAD = 30;

// diverging blue -> gray -> red over bias score -0.5..+0.5
const biasScale = scaleLinear<string>(
  [-0.5, 0, 0.5],
  ["#2a78d6", "#c3c2b7", "#e34948"],
).clamp(true);

/** Outlets positioned by the similarity of what they publish (UMAP of mean
    embeddings). Nearby outlets cover news similarly; color = political lean. */
export default function OutletMap() {
  const { data } = useQuery<{ outlets: OutletPoint[] }>({
    queryKey: ["outletMap"],
    queryFn: () => fetch("/api/outlets/map").then((r) => r.json()),
  });
  const [hover, setHover] = useState<OutletPoint | null>(null);

  if (!data) return <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Loading map…</p>;
  if (data.outlets.length < 2)
    return <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Not enough outlets yet.</p>;

  const xs = data.outlets.map((o) => o.x);
  const ys = data.outlets.map((o) => o.y);
  const sx = scaleLinear([Math.min(...xs), Math.max(...xs)], [PAD, W - PAD]);
  const sy = scaleLinear([Math.min(...ys), Math.max(...ys)], [H - PAD, PAD]);
  const sr = scaleSqrt([1, Math.max(...data.outlets.map((o) => o.articles))], [4, 16]);

  const labeled = [...data.outlets].sort((a, b) => b.articles - a.articles).slice(0, 8);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Outlet similarity map">
        {data.outlets.map((o) => (
          <circle
            key={o.domain}
            cx={sx(o.x)}
            cy={sy(o.y)}
            r={sr(o.articles)}
            fill={biasScale(o.mean_bias ?? 0)}
            fillOpacity={0.8}
            stroke="var(--surface-1)"
            strokeWidth={2}
            onMouseEnter={() => setHover(o)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {labeled.map((o) => (
          <text
            key={o.domain}
            // keep long domains inside the svg instead of clipping at the edge
            x={Math.min(Math.max(sx(o.x), 70), W - 70)}
            y={sy(o.y) - sr(o.articles) - 3}
            fontSize={10}
            textAnchor="middle"
            fill="var(--ink-2)"
          >
            {o.domain}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex items-center gap-3 text-xs" style={{ color: "var(--ink-2)" }}>
        <span>lean:</span>
        <span className="inline-block h-2 w-24 rounded-full" style={{ background: "linear-gradient(to right, #2a78d6, #c3c2b7, #e34948)" }} />
        <span>left ↔ right · circle size = article volume · proximity = similar coverage</span>
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute left-2 top-2 rounded border px-2 py-1 text-xs shadow-sm"
          style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
        >
          <div className="font-medium">{hover.domain}</div>
          <div style={{ color: "var(--ink-muted)" }}>
            {hover.articles} articles · lean {hover.mean_bias?.toFixed(2) ?? "n/a"}
          </div>
        </div>
      )}
    </div>
  );
}
