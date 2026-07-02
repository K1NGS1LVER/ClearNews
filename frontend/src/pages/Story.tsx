import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchArc, fetchOutlets } from "../api";
import BiasBar from "../components/BiasBar";
import ChatPanel from "../components/ChatPanel";
import DriftMap from "../components/DriftMap";

const axis = { stroke: "var(--baseline)", fontSize: 11, tickLine: false } as const;
const grid = <CartesianGrid stroke="var(--grid)" vertical={false} />;
const tooltipStyle = {
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 12,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

/** Time-series charts are noise below two days of data - show why instead. */
function NeedsMoreDays() {
  return (
    <p className="py-6 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
      Coverage spans a single day so far. This chart appears once the story has
      2+ days of history.
    </p>
  );
}

export default function Story() {
  const id = Number(useParams().id);
  const { data: arc } = useQuery({ queryKey: ["arc", id], queryFn: () => fetchArc(id) });
  const { data: outlets } = useQuery({
    queryKey: ["outlets", id],
    queryFn: () => fetchOutlets(id),
  });

  if (!arc) return <p className="p-8" style={{ color: "var(--ink-muted)" }}>Loading…</p>;

  const biasData = arc.metrics.map((m) => ({
    day: m.day,
    left: m.bias_left_share ?? 0,
    center: m.bias_center_share ?? 0,
    right: m.bias_right_share ?? 0,
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link to="/" className="text-sm" style={{ color: "var(--ink-muted)" }}>
        ← All stories
      </Link>
      <h1 className="mb-1 mt-2 text-xl font-bold">{arc.title}</h1>
      <p className="mb-4 text-sm uppercase tracking-wide" style={{ color: "var(--ink-2)" }}>
        {arc.status} · {arc.articles.length} articles
      </p>

      <div className="flex flex-col gap-4">
        <Section title="Coverage volume (articles per day)">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={arc.metrics}>
              {grid}
              <XAxis dataKey="day" {...axis} />
              <YAxis allowDecimals={false} {...axis} width={28} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--grid)" }} />
              <Bar dataKey="article_count" name="Articles" fill="var(--series-volume)" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title="Coverage lean over time (share of articles)">
          {biasData.length < 2 ? (
            <NeedsMoreDays />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={biasData} stackOffset="expand">
                {grid}
                <XAxis dataKey="day" {...axis} />
                <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} {...axis} width={36} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => `${Math.round(Number(v) * 100)}%`}
                />
                <Area dataKey="left" name="Left" stackId="1" stroke="none" fill="var(--bias-left)" />
                <Area dataKey="center" name="Center" stackId="1" stroke="none" fill="var(--bias-center)" />
                <Area dataKey="right" name="Right" stackId="1" stroke="none" fill="var(--bias-right)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
          <BiasBar
            left={average(arc.metrics.map((m) => m.bias_left_share))}
            center={average(arc.metrics.map((m) => m.bias_center_share))}
            right={average(arc.metrics.map((m) => m.bias_right_share))}
            showLabels
          />
        </Section>

        <Section title="Sentiment trajectory (VADER, −1 to +1)">
          {arc.metrics.length < 2 ? (
            <NeedsMoreDays />
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={arc.metrics}>
                {grid}
                <XAxis dataKey="day" {...axis} />
                <YAxis domain={[-1, 1]} {...axis} width={32} />
                <ReferenceLine y={0} stroke="var(--baseline)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  dataKey="sentiment_mean"
                  name="Sentiment"
                  stroke="var(--series-sentiment)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Narrative drift (day-over-day centroid shift)">
          {arc.metrics.length < 2 ? (
            <NeedsMoreDays />
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={arc.metrics}>
                {grid}
                <XAxis dataKey="day" {...axis} />
                <YAxis {...axis} width={32} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  dataKey="drift_score"
                  name="Drift"
                  stroke="var(--series-drift)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Drift map (articles in embedding space)">
          <DriftMap storyId={id} />
        </Section>

        <Section title="Ask about this story">
          <ChatPanel storyId={id} />
        </Section>

        <Section title="Outlets covering this story">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase" style={{ color: "var(--ink-muted)" }}>
                <th className="py-1">Outlet</th>
                <th className="text-right">Articles</th>
                <th className="text-right">Sentiment</th>
                <th className="text-right">Lean here</th>
                <th className="text-right">Outlet overall</th>
              </tr>
            </thead>
            <tbody>
              {outlets?.map((o) => (
                <tr key={o.domain} style={{ borderTop: "1px solid var(--grid)" }}>
                  <td className="py-1.5">{o.domain}</td>
                  <td className="text-right tabular-nums">{o.article_count}</td>
                  <td className="text-right tabular-nums">{fmt(o.sentiment_mean)}</td>
                  <td className="text-right tabular-nums">{lean(o.bias_mean)}</td>
                  <td className="text-right tabular-nums">{lean(o.outlet_overall_bias)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Articles">
          <ul className="flex flex-col gap-2">
            {arc.articles.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <BiasChip label={a.bias_label} />
                <Link
                  to={`/article/${a.id}`}
                  className="min-w-0 flex-1 truncate hover:underline"
                >
                  {a.title ?? a.url}
                </Link>
                <span
                  className="max-w-[40%] shrink-0 truncate text-right text-xs"
                  style={{ color: "var(--ink-muted)" }}
                >
                  {a.outlet} · {a.published_at}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function BiasChip({ label }: { label: string | null }) {
  if (!label) return null;
  const bg =
    label === "left" ? "var(--bias-left)" : label === "right" ? "var(--bias-right)" : "var(--bias-center)";
  const ink = label === "center" ? "var(--ink-2)" : "#fff";
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
      style={{ background: bg, color: ink }}
    >
      {label}
    </span>
  );
}

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

const fmt = (v: number | null) => (v === null ? "–" : v.toFixed(2));
const lean = (v: number | null) =>
  v === null ? "–" : `${v > 0 ? "R" : v < 0 ? "L" : ""}${Math.abs(v).toFixed(2)}`;
