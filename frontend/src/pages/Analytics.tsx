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
import BiasBar from "../components/BiasBar";
import OutletMap from "../components/OutletMap";

type Analytics = {
  stories_by_status: Record<string, number>;
  articles_by_bias: Record<string, number>;
  avg_story_lifespan_days: number | null;
  by_category: { category: string; stories: number; avg_lifespan_days: number }[];
  top_death_risk: { story_id: number; title: string; death_risk: number }[];
  top_outlets: { domain: string; articles: number; mean_bias: number | null }[];
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-lg border p-4"
      style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
    >
      <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--ink-2)" }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs" style={{ color: "var(--ink-muted)" }}>{label}</div>
    </div>
  );
}

export default function Analytics() {
  const { data } = useQuery<Analytics>({
    queryKey: ["analytics"],
    queryFn: () => fetch("/api/analytics").then((r) => r.json()),
  });
  if (!data) return <p className="p-8" style={{ color: "var(--ink-muted)" }}>Loading…</p>;

  const bias = data.articles_by_bias;
  const totalBias = (bias.left ?? 0) + (bias.center ?? 0) + (bias.right ?? 0) || 1;
  const status = data.stories_by_status;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="active stories" value={String(status.active ?? 0)} />
        <Stat label="fading stories" value={String(status.fading ?? 0)} />
        <Stat label="dead stories" value={String(status.dead ?? 0)} />
        <Stat
          label="avg lifespan (days)"
          value={(data.avg_story_lifespan_days ?? 0).toFixed(1)}
        />
      </div>

      <div className="flex flex-col gap-4">
        <Card title="Political lean across all coverage">
          <BiasBar
            left={(bias.left ?? 0) / totalBias}
            center={(bias.center ?? 0) / totalBias}
            right={(bias.right ?? 0) / totalBias}
            showLabels
          />
        </Card>

        <Card title="Stories and lifespan by category">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.by_category}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="category" stroke="var(--baseline)" fontSize={11} tickLine={false} />
              <YAxis allowDecimals={false} stroke="var(--baseline)" fontSize={11} tickLine={false} width={28} />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                cursor={{ fill: "var(--grid)" }}
              />
              <Bar dataKey="stories" name="Stories" fill="var(--series-volume)" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Outlet similarity map">
          <OutletMap />
        </Card>

        {data.top_death_risk.length > 0 && (
          <Card title="Stories most at risk of dying (model score)">
            <ul className="flex flex-col gap-1 text-sm">
              {data.top_death_risk.map((s) => (
                <li key={s.story_id} className="flex items-center gap-2">
                  <span
                    className="w-12 shrink-0 text-right font-semibold tabular-nums"
                    style={{ color: s.death_risk > 0.7 ? "#d03b3b" : "var(--ink-2)" }}
                  >
                    {Math.round(s.death_risk * 100)}%
                  </span>
                  <Link to={`/story/${s.story_id}`} className="truncate hover:underline">
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Most active outlets">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase" style={{ color: "var(--ink-muted)" }}>
                <th className="py-1">Outlet</th>
                <th className="text-right">Articles</th>
                <th className="text-right">Mean lean</th>
              </tr>
            </thead>
            <tbody>
              {data.top_outlets.map((o) => (
                <tr key={o.domain} style={{ borderTop: "1px solid var(--grid)" }}>
                  <td className="py-1.5">{o.domain}</td>
                  <td className="text-right tabular-nums">{o.articles}</td>
                  <td className="text-right tabular-nums">
                    {o.mean_bias === null
                      ? "–"
                      : `${o.mean_bias > 0 ? "R" : "L"}${Math.abs(o.mean_bias).toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
