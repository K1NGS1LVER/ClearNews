import { useState } from "react";
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
import { decodeEntities, fetchArc, fetchOutlets } from "../api";
import BiasBar from "../components/BiasBar";
import BiasChip from "../components/BiasChip";
import DriftMap from "../components/DriftMap";
import Loading from "../components/Loading";
import StoryAsk from "../components/StoryAsk";
import StoryExplain from "../components/StoryExplain";

const mono = { fontFamily: "var(--font-mono)" } as const;
const serif = { fontFamily: "var(--font-serif)" } as const;

const COVERAGE_PAGE_SIZE = 15;

const axis = { stroke: "var(--baseline)", fontSize: 11, tickLine: false } as const;
const grid = <CartesianGrid stroke="var(--grid)" vertical={false} />;
const tooltipStyle = {
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 12,
};

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-[10px] border p-[18px_22px] sm:p-5"
      style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 style={{ ...serif, fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{title}</h3>
        {hint && (
          <span style={{ ...mono, fontSize: 10, letterSpacing: "0.06em", color: "var(--ink-muted)" }}>{hint}</span>
        )}
      </div>
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
  const [coverageExpanded, setCoverageExpanded] = useState(false);
  const { data: arc } = useQuery({ queryKey: ["arc", id], queryFn: () => fetchArc(id) });
  const { data: outlets } = useQuery({
    queryKey: ["outlets", id],
    queryFn: () => fetchOutlets(id),
  });

  if (!arc) return <Loading />;

  const volumeData = [
    ...arc.metrics.map((m) => ({ day: m.day, article_count: m.article_count })),
    ...arc.forecast.map((f) => ({
      day: f.day,
      predicted_count: Math.round(f.predicted_count * 10) / 10,
    })),
  ];

  const biasData = arc.metrics.map((m) => ({
    day: m.day,
    left: m.bias_left_share ?? 0,
    center: m.bias_center_share ?? 0,
    right: m.bias_right_share ?? 0,
  }));

  const lastTwo = arc.metrics.slice(-2).map((m) => m.article_count);
  const trend =
    lastTwo.length === 2
      ? lastTwo[1] > lastTwo[0]
        ? { label: "▲ RISING", color: "var(--status-active)" }
        : lastTwo[1] < lastTwo[0]
          ? { label: "▼ FALLING", color: "var(--status-fading)" }
          : { label: "— STEADY", color: "var(--ink-muted)" }
      : null;

  return (
    <StoryAsk storyId={id} articleCount={arc.articles.length}>
      <div className="mx-auto max-w-4xl px-4 pb-8 pt-2 sm:px-8">
        <div className="mb-4 flex flex-col gap-2.5">
          <Link to="/" style={{ ...mono, fontSize: 11, color: "var(--ink-muted)" }}>
            ← ALL STORIES
          </Link>
          <h1 style={{ ...serif, fontSize: 26, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.01em", color: "var(--ink)" }}>
            {decodeEntities(arc.title)}
          </h1>
          <div className="flex flex-wrap items-center gap-2" style={{ ...mono, fontSize: "10.5px", letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: statusVar(arc.status) }} />
            <span style={{ color: statusVar(arc.status), fontWeight: 600 }}>{arc.status.toUpperCase()}</span>
            <span>·</span>
            <span>{arc.articles.length} ARTICLES</span>
            {outlets && (
              <>
                <span>·</span>
                <span>{outlets.length} OUTLETS</span>
              </>
            )}
            {trend && (
              <>
                <span>·</span>
                <span style={{ color: trend.color }}>{trend.label}</span>
              </>
            )}
          </div>
          <div className="max-w-[520px]">
            <BiasBar
              left={average(arc.metrics.map((m) => m.bias_left_share))}
              center={average(arc.metrics.map((m) => m.bias_center_share))}
              right={average(arc.metrics.map((m) => m.bias_right_share))}
              showLabels
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title={`The coverage — ${arc.articles.length} articles`} hint="NEWEST FIRST">
            <ul className="flex flex-col">
              {(coverageExpanded ? arc.articles : arc.articles.slice(0, COVERAGE_PAGE_SIZE)).map((a, i) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 py-2.5"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--hair)" }}
                >
                  <BiasChip label={a.bias_label} />
                  <Link to={`/article/${a.id}`} className="min-w-0 flex-1 truncate hover:underline" style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>
                    {a.title ? decodeEntities(a.title) : a.url}
                  </Link>
                  <span className="max-w-[40%] shrink-0 truncate text-right" style={{ ...mono, fontSize: 10, color: "var(--ink-muted)" }}>
                    {a.outlet} · {a.published_at}
                  </span>
                </li>
              ))}
            </ul>
            {arc.articles.length > COVERAGE_PAGE_SIZE && (
              <button
                type="button"
                onClick={() => setCoverageExpanded((v) => !v)}
                className="coverage-toggle mt-2 flex w-full items-center justify-center gap-1.5 border-t py-2.5 hover:opacity-70"
                style={{ ...mono, fontSize: 10, letterSpacing: "0.08em", color: "var(--ink-muted)", borderColor: "var(--hair)" }}
              >
                {coverageExpanded ? (
                  <>SHOW FEWER <span className="coverage-toggle-arrow">▲</span></>
                ) : (
                  <>SHOW {arc.articles.length - COVERAGE_PAGE_SIZE} MORE <span className="coverage-toggle-arrow">▼</span></>
                )}
              </button>
            )}
          </Panel>

          <Panel title="Lifecycle — coverage volume" hint="HOLLOW BARS = FORECAST">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={volumeData}>
                {grid}
                <XAxis dataKey="day" {...axis} />
                <YAxis allowDecimals={false} {...axis} width={28} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--grid)" }} />
                <Bar dataKey="article_count" name="Articles" fill="var(--series-volume)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                <Bar dataKey="predicted_count" name="Forecast" fill="var(--series-volume)" fillOpacity={0.3} radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
            {arc.forecast.length > 0 && (
              <p className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
                Lighter bars: projected volume for the next {arc.forecast.length} days
                (log-linear trend on the past week).
              </p>
            )}
          </Panel>

          <Panel title="Framing — lean, sentiment &amp; drift">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <span style={{ ...mono, fontSize: 10, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>LEAN SHARE BY DAY</span>
                {biasData.length < 2 ? (
                  <NeedsMoreDays />
                ) : (
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={biasData} stackOffset="expand">
                      {grid}
                      <XAxis dataKey="day" {...axis} />
                      <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} {...axis} width={36} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Math.round(Number(v) * 100)}%`} />
                      <Area dataKey="left" name="Left" stackId="1" stroke="none" fill="var(--bias-left)" />
                      <Area dataKey="center" name="Center" stackId="1" stroke="none" fill="var(--bias-center)" />
                      <Area dataKey="right" name="Right" stackId="1" stroke="none" fill="var(--bias-right)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div>
                <span style={{ ...mono, fontSize: 10, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>SENTIMENT, VADER −1…+1</span>
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
                      <Line dataKey="sentiment_mean" name="Sentiment" stroke="var(--series-sentiment)" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t pt-4" style={{ borderColor: "var(--hair)" }}>
              <span style={{ ...mono, fontSize: 10, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>
                DRIFT MAP — ARTICLES IN EMBEDDING SPACE
              </span>
              {arc.metrics.length < 2 ? <NeedsMoreDays /> : <DriftMap storyId={id} />}
              {arc.metrics.length >= 2 && (
                <ResponsiveContainer width="100%" height={100}>
                  <LineChart data={arc.metrics}>
                    {grid}
                    <XAxis dataKey="day" {...axis} />
                    <YAxis {...axis} width={32} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line dataKey="drift_score" name="Drift" stroke="var(--series-drift)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Panel>

          <Panel title="Why these lean labels?" hint="SHAP EXPLANATION">
            <StoryExplain storyId={id} />
          </Panel>

          <Panel title="Outlets on this story">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ ...mono, fontSize: "9.5px", letterSpacing: "0.08em", color: "var(--ink-muted)" }} className="text-left uppercase">
                  <th className="pb-1.5 font-normal">Outlet</th>
                  <th className="pb-1.5 text-right font-normal">Art.</th>
                  <th className="pb-1.5 text-right font-normal">Sent.</th>
                  <th className="pb-1.5 text-right font-normal">Lean here</th>
                </tr>
              </thead>
              <tbody>
                {outlets?.map((o) => (
                  <tr key={o.domain} style={{ borderTop: "1px solid var(--hair)" }}>
                    <td className="py-2">{o.domain}</td>
                    <td className="py-2 text-right tabular-nums" style={mono}>{o.article_count}</td>
                    <td className="py-2 text-right tabular-nums" style={mono}>{fmt(o.sentiment_mean)}</td>
                    <td className="py-2 text-right tabular-nums" style={{ ...mono, color: "var(--ink-muted)" }}>
                      {lean(o.bias_mean)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </StoryAsk>
  );
}

function statusVar(status: string) {
  return status === "active" || status === "fading" || status === "dead"
    ? `var(--status-${status})`
    : "var(--ink-muted)";
}

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

const fmt = (v: number | null) => (v === null ? "–" : v.toFixed(2));
const lean = (v: number | null) =>
  v === null ? "–" : `${v > 0 ? "R" : v < 0 ? "L" : ""}${Math.abs(v).toFixed(2)}`;
