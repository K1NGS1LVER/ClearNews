import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { decodeEntities } from "../api";
import BiasBar from "../components/BiasBar";
import Loading from "../components/Loading";
import OutletMap from "../components/OutletMap";

const mono = { fontFamily: "var(--font-mono)" } as const;
const serif = { fontFamily: "var(--font-serif)" } as const;

type Analytics = {
  stories_by_status: Record<string, number>;
  articles_by_bias: Record<string, number>;
  avg_story_lifespan_days: number | null;
  by_category: { category: string; stories: number; avg_lifespan_days: number }[];
  top_death_risk: { story_id: number; title: string; death_risk: number }[];
  top_outlets: { domain: string; articles: number; mean_bias: number | null }[];
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border p-5" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
      <h3 className="mb-3" style={{ ...serif, fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{title}</h3>
      {children}
    </section>
  );
}

function Stat({ value, label, dot }: { value: string; label: string; dot?: string }) {
  return (
    <div className="rounded-[10px] border p-4" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
      <div style={{ ...mono, fontSize: 26, fontWeight: 600, color: "var(--ink)" }}>{value}</div>
      <div className="mt-0.5" style={{ ...mono, fontSize: "9.5px", letterSpacing: "0.08em", color: dot ?? "var(--ink-muted)" }}>
        {dot ? "● " : "○ "}{label}
      </div>
    </div>
  );
}

export default function Analytics() {
  const { data } = useQuery<Analytics>({
    queryKey: ["analytics"],
    queryFn: () => fetch("/api/analytics").then((r) => r.json()),
  });
  if (!data) return <Loading />;

  const bias = data.articles_by_bias;
  const totalBias = (bias.left ?? 0) + (bias.center ?? 0) + (bias.right ?? 0) || 1;
  const status = data.stories_by_status;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-8 pt-2 sm:px-8">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={String(status.active ?? 0)} label="ACTIVE STORIES" dot="var(--status-active)" />
        <Stat value={String(status.fading ?? 0)} label="FADING" dot="var(--status-fading)" />
        <Stat value={String(status.dead ?? 0)} label="DEAD (ARCHIVE)" />
        <Stat value={(data.avg_story_lifespan_days ?? 0).toFixed(1)} label="AVG STORY LIFESPAN (D)" />
      </div>

      <div className="flex flex-col gap-4">
        <Panel title="Political lean across all coverage">
          <BiasBar
            left={(bias.left ?? 0) / totalBias}
            center={(bias.center ?? 0) / totalBias}
            right={(bias.right ?? 0) / totalBias}
            showLabels
          />
          <div className="mt-1 flex justify-between" style={{ ...mono, fontSize: 10, color: "var(--ink-muted)" }}>
            <span>{bias.left ?? 0} articles</span>
            <span>{bias.center ?? 0} articles</span>
            <span>{bias.right ?? 0} articles</span>
          </div>
        </Panel>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Panel title="Stories by category">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.by_category}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="category" stroke="var(--baseline)" fontSize={11} tickLine={false} tick={{ fill: "var(--ink-muted)" }} />
                <YAxis allowDecimals={false} stroke="var(--baseline)" fontSize={11} tickLine={false} width={28} tick={{ fill: "var(--ink-muted)" }} />
                <Tooltip
                  contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                  cursor={{ fill: "var(--grid)" }}
                />
                <Bar dataKey="stories" name="Stories" fill="var(--series-volume)" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>

          {data.top_death_risk.length > 0 && (
            <Panel title="Stories at risk of dying">
              <ul className="flex flex-col">
                {data.top_death_risk.map((s, i) => (
                  <li key={s.story_id} className="flex items-center gap-3 py-2" style={{ borderTop: i === 0 ? "none" : "1px solid var(--hair)" }}>
                    <span
                      className="w-10 shrink-0 text-right font-semibold tabular-nums"
                      style={{ ...mono, fontSize: 12, color: s.death_risk > 0.7 ? "var(--bias-right)" : "var(--ink-2)" }}
                    >
                      {Math.round(s.death_risk * 100)}%
                    </span>
                    <Link
                      to={`/story/${s.story_id}`}
                      title={decodeEntities(s.title)}
                      className="min-w-0 flex-1 truncate text-[13px] hover:underline"
                      style={{ color: "var(--ink)" }}
                    >
                      {decodeEntities(s.title)}
                    </Link>
                  </li>
                ))}
              </ul>
              <span className="mt-1 block" style={{ ...mono, fontSize: "9.5px", color: "var(--ink-muted)" }}>
                MODEL SCORE · P(NO COVERAGE IN NEXT 48H)
              </span>
            </Panel>
          )}
        </div>

        <Panel title="Outlet landscape — proximity = similar coverage">
          <OutletMap />
        </Panel>

        <Panel title="Most active outlets">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ ...mono, fontSize: "9.5px", letterSpacing: "0.08em", color: "var(--ink-muted)" }} className="text-left uppercase">
                <th className="pb-1.5 font-normal">Outlet</th>
                <th className="pb-1.5 text-right font-normal">Articles</th>
                <th className="pb-1.5 text-right font-normal">Mean lean</th>
              </tr>
            </thead>
            <tbody>
              {data.top_outlets.map((o) => (
                <tr key={o.domain} style={{ borderTop: "1px solid var(--hair)" }}>
                  <td className="py-2">{o.domain}</td>
                  <td className="py-2 text-right tabular-nums" style={mono}>{o.articles}</td>
                  <td className="py-2 text-right tabular-nums" style={mono}>
                    {o.mean_bias === null ? "–" : `${o.mean_bias > 0 ? "R" : "L"}${Math.abs(o.mean_bias).toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
