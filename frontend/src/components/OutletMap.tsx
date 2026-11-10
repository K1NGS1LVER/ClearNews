import { useQuery } from "@tanstack/react-query";
import { scaleLinear, scaleSqrt } from "d3";
import { useState } from "react";
import { withErrorBoundary } from "./ErrorBoundary";
import Loading from "./Loading";

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
  ["var(--bias-left)", "var(--color-muted)", "var(--bias-right)"],
).clamp(true);

/** Outlets positioned by the similarity of what they publish (UMAP of mean
    embeddings). Nearby outlets cover news similarly; color = political lean. */
function OutletMap() {
  const { data } = useQuery<{ outlets: OutletPoint[] }>({
    queryKey: ["outletMap"],
    queryFn: () => fetch("/api/outlets/map").then((r) => r.json()),
  });
  const [hover, setHover] = useState<OutletPoint | null>(null);

  if (!data) return <Loading label="Loading map…" compact />;
  if (data.outlets.length < 2)
    return <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>Not enough outlets yet.</p>;

  const xs = data.outlets.map((o) => o.x);
  const ys = data.outlets.map((o) => o.y);
  const sx = scaleLinear([Math.min(...xs), Math.max(...xs)], [PAD, W - PAD]);
  const sy = scaleLinear([Math.min(...ys), Math.max(...ys)], [H - PAD, PAD]);
  const sr = scaleSqrt([1, Math.max(...data.outlets.map((o) => o.articles))], [4, 16]);

  const labeled = [...data.outlets].sort((a, b) => b.articles - a.articles).slice(0, 8);

  const mono = { fontFamily: "var(--font-outlier)" } as const;

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
            stroke="var(--color-paper)"
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
            fill="var(--color-ink-2)"
          >
            {o.domain}
          </text>
        ))}
      </svg>
      <div
        className="mt-1.5 flex flex-wrap items-center gap-2.5"
        style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.04em", color: "var(--color-muted)" }}
      >
        <span>LEFT</span>
        <span className="inline-block h-1.5 w-20 rounded-full" style={{ background: "linear-gradient(to right, var(--bias-left), var(--color-muted), var(--bias-right))" }} />
        <span>RIGHT</span>
        <span className="ml-2">SIZE = VOLUME</span>
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute left-2 top-2 rounded-md border px-2 py-1 text-xs shadow-sm"
          style={{ background: "var(--color-paper)", borderColor: "var(--color-rule)", borderRadius: "var(--radius-input)" }}
        >
          <div style={{ fontWeight: 600, color: "var(--color-ink)" }}>{hover.domain}</div>
          <div style={{ color: "var(--color-muted)" }}>
            {hover.articles} articles · lean {hover.mean_bias?.toFixed(2) ?? "n/a"}
          </div>
        </div>
      )}
    </div>
  );
}

export default withErrorBoundary(OutletMap, "OutletMap");
