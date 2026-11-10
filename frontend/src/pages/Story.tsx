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
import { decodeEntities, fetchArc, fetchOutlets, summariseStory } from "../api";
import BiasBar from "../components/BiasBar";
import BiasChip from "../components/BiasChip";
import BiasConfidenceNote from "../components/BiasConfidenceNote";
import DriftMap from "../components/DriftMap";
import Loading from "../components/Loading";
import StoryAsk from "../components/StoryAsk";
import StoryExplain from "../components/StoryExplain";
import { classifyStoryShape, PATTERN_STYLE } from "../lib/storyShape";
import { useScrollRestoration } from "../hooks/usePageState";

const mono = { fontFamily: "var(--font-outlier)" } as const;
const body = { fontFamily: "var(--font-body)" } as const;
const display = { fontFamily: "var(--font-display)" } as const;

const COVERAGE_PAGE_SIZE = 15;

const axis = { stroke: "var(--color-rule)", fontSize: 11, tickLine: false, tick: { fill: "var(--color-muted)" } } as const;
const grid = <CartesianGrid stroke="var(--color-rule)" vertical={false} />;
const tooltipStyle = {
  background: "var(--color-paper)",
  border: "1px solid var(--color-rule)",
  borderRadius: "var(--radius-input)",
  fontSize: "var(--text-sm)",
};

/* Focus and active state helpers for Hallmark Floor 26a & Reflex 26b */
const focusStyle = {
  outline: "2px solid var(--color-focus)",
  outlineOffset: "2px",
} as const;

const pressSpringStyle = {
  transform: "translateY(3px)",
  transition: "transform var(--dur-micro) var(--ease-out)",
} as const;

function Panel({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "var(--color-paper)",
        border: "1px solid var(--color-rule)",
        borderRadius: "var(--radius-card)",
        padding: "var(--space-xl)",
        boxShadow: "var(--shadow-card)",
        transition: "transform var(--dur-short) var(--ease-out), box-shadow var(--dur-short) var(--ease-out), border-color var(--dur-short) var(--ease-out)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "var(--shadow-lift)";
        e.currentTarget.style.borderColor = "var(--color-accent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "var(--shadow-card)";
        e.currentTarget.style.borderColor = "var(--color-rule)";
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-md)", marginBottom: "var(--space-lg)" }}>
        <h3 style={{ ...display, fontSize: "var(--text-title)", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.01em", color: "var(--color-ink)" }}>{title}</h3>
        {hint && (
          typeof hint === "string" ? (
            <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.06em", color: "var(--color-muted)" }}>{hint}</span>
          ) : (
            hint
          )
        )}
      </div>
      {children}
    </section>
  );
}

function DeathRiskBadge({ risk }: { risk: number | null }) {
  if (risk === null) return (
    <span style={{ ...mono, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
      FADE RISK: MODEL NOT TRAINED YET
    </span>
  );
  const pct = Math.round(risk * 100);
  const color = risk > 0.7 ? "var(--bias-right)" : risk > 0.4 ? "var(--status-fading)" : "var(--status-active)";
  return (
    <span
      style={{ ...mono, fontSize: "var(--text-xs)", color }}
      title="Probability this story loses all coverage within 30 days (XGBoost model, trained on stories ≥30 days old)"
    >
      {pct}% FADE RISK — 30D
    </span>
  );
}

function StorySummary({ storyId, initial }: { storyId: number; initial: string | null }) {
  const [summary, setSummary] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await summariseStory(storyId);
      setSummary(res.summary);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel title="Summary">
      {summary ? (
        <p style={{ ...body, fontSize: "var(--text-base)", lineHeight: 1.7, color: "var(--color-ink-2)" }}>
          {summary}
        </p>
      ) : (
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded-md px-4 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-opacity"
          style={{
            background: "var(--color-ink)",
            color: "var(--color-paper)",
            borderRadius: "var(--radius-input)",
            padding: "var(--space-sm) var(--space-lg)",
            fontSize: "var(--text-xs)",
            fontFamily: "var(--font-body)",
            fontWeight: 500,
            boxShadow: "inset 0 1px 0 var(--glint), 0 0 0 1px var(--color-rule), 0 3px 0 var(--color-rule)",
          }}
          onMouseDown={(e) => Object.assign(e.currentTarget.style, pressSpringStyle)}
          onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
        >
          {loading ? "Generating…" : "Generate story summary"}
        </button>
      )}
    </Panel>
  );
}

/** Time-series charts are noise below two days of data - show why instead. */
function NeedsMoreDays() {
  return (
    <p style={{ padding: "var(--space-2xl)", textAlign: "center", fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
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
  useScrollRestoration(`story-${id}`);

  if (!arc) return <Loading />;

  const volumeData = arc.metrics.map((m) => ({ day: m.day, article_count: m.article_count }));

  const biasData = arc.metrics.map((m) => ({
    day: m.day,
    left: m.bias_left_share ?? 0,
    center: m.bias_center_share ?? 0,
    right: m.bias_right_share ?? 0,
  }));

  const pattern = classifyStoryShape(arc.metrics.map((m) => m.article_count));
  const patternStyle = PATTERN_STYLE[pattern];

  return (
    <StoryAsk storyId={id} articleCount={arc.articles.length}>
      <div style={{ minHeight: "100vh", background: "var(--color-paper)", color: "var(--color-ink)" }}>
        <section style={{ paddingTop: "var(--space-xl)", paddingBottom: "var(--space-lg)" }}>
          <div className="container">
            <Link to="/stories" style={{ ...mono, fontSize: "var(--text-xs)", color: "var(--color-muted)", textDecoration: "none", transition: "color var(--dur-micro) var(--ease-out)" }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>
              ← ALL STORIES
            </Link>
            <h1 style={{ ...display, fontSize: "var(--text-display)", fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.03em", color: "var(--color-ink)", marginTop: "var(--space-lg)", marginBottom: "var(--space-lg)", maxWidth: "20ch" }}>
              {decodeEntities(arc.agent_headline || arc.title)}
            </h1>
            {arc.agent_headline && arc.agent_headline !== arc.title && (
              <p style={{ ...mono, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                RAW SOURCE TITLE: {decodeEntities(arc.title)}
              </p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-md)", marginTop: "var(--space-md)" }}>
              <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.06em", color: "var(--color-muted)" }}>
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: statusVar(arc.status), display: "inline-block", marginRight: "var(--space-xs)" }} />
                <span style={{ color: statusVar(arc.status), fontWeight: 600 }}>{arc.status.toUpperCase()}</span>
                <span>·</span>
                <span>{arc.articles.length} ARTICLES</span>
                {arc.coherence_score !== undefined && arc.coherence_score !== null && (
                  <>
                    <span>·</span>
                    <span title="Agent cluster semantic coherence score">COHERENCE {Math.round(arc.coherence_score * 100)}%</span>
                  </>
                )}
                {outlets && (
                  <>
                    <span>·</span>
                    <span>{outlets.length} OUTLETS</span>
                  </>
                )}
                <span>·</span>
                <span style={{ color: patternStyle.color }}>{patternStyle.label}</span>
              </span>
            </div>
            <div style={{ maxWidth: "520px", marginTop: "var(--space-lg)" }}>
              <BiasBar
                left={average(arc.metrics.map((m) => m.bias_left_share))}
                center={average(arc.metrics.map((m) => m.bias_center_share))}
                right={average(arc.metrics.map((m) => m.bias_right_share))}
                showLabels
              />
              <BiasConfidenceNote
                centerShare={average(arc.metrics.map((m) => m.bias_center_share))}
              />
            </div>
          </div>
        </section>

        <section style={{ paddingBottom: "var(--section-gap)" }}>
          <div className="container" style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
            <StorySummary storyId={id} initial={arc.summary} />

            {arc.milestones && arc.milestones.length > 0 && (
              <Panel title="Narrative Evolution — Timeline Milestones" hint="AGENT TRACKED">
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)", paddingTop: "var(--space-sm)" }}>
                  {arc.milestones.map((m, idx) => (
                    <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)", paddingLeft: "var(--space-md)", borderLeft: "2px solid var(--color-rule)" }}>
                      <div style={{ ...mono, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                        <span>{m.date || "Timeline Event"}</span>
                      </div>
                      <div style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--color-ink)" }}>
                        {m.event}
                      </div>
                      {m.narrative_shift && (
                        <div style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
                          {m.narrative_shift}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            <Panel title={`The coverage — ${arc.articles.length} articles`} hint="NEWEST FIRST">
              <ul style={{ display: "flex", flexDirection: "column" }}>
                {(coverageExpanded ? arc.articles : arc.articles.slice(0, COVERAGE_PAGE_SIZE)).map((a, i) => (
                  <li
                    key={a.id}
                    style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", paddingTop: "var(--space-sm)", paddingBottom: "var(--space-sm)", borderTop: i === 0 ? "none" : "1px solid var(--color-rule)" }}
                  >
                    <BiasChip label={a.bias_label} confidence={a.bias_confidence} />
                    <Link to={`/article/${a.id}`} style={{ minWidth: 0, flex: 1, textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden", fontSize: "var(--text-base)", fontWeight: 500, color: "var(--color-ink)", textDecoration: "none", transition: "text-decoration var(--dur-micro) var(--ease-out)" }} onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }} onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }} onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)} onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}>
                      {a.title ? decodeEntities(a.title) : a.url}
                    </Link>
                    <span style={{ maxWidth: "40%", flexShrink: 0, textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden", textAlign: "right", ...mono, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                      {a.outlet} · {a.published_at}
                    </span>
                  </li>
                ))}
              </ul>
              {arc.articles.length > COVERAGE_PAGE_SIZE && (
                <button
                  type="button"
                  onClick={() => setCoverageExpanded((v) => !v)}
                  style={{
                    ...mono,
                    fontSize: "var(--text-xs)",
                    letterSpacing: "0.08em",
                    color: "var(--color-muted)",
                    marginTop: "var(--space-md)",
                    paddingTop: "var(--space-sm)",
                    paddingBottom: "var(--space-sm)",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "var(--space-xs)",
                    borderTop: "1px solid var(--color-rule)",
                    background: "transparent",
                    cursor: "pointer",
                    transition: "opacity var(--dur-micro) var(--ease-out)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                >
                  {coverageExpanded ? (
                    <>SHOW FEWER <span>▲</span></>
                  ) : (
                    <>SHOW {arc.articles.length - COVERAGE_PAGE_SIZE} MORE <span>▼</span></>
                  )}
                </button>
              )}
            </Panel>

            <Panel title="Lifecycle — coverage volume" hint={<DeathRiskBadge risk={arc.death_risk} />}>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={volumeData}>
                  {grid}
                  <XAxis dataKey="day" {...axis} />
                  <YAxis allowDecimals={false} {...axis} width={28} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-rule)" }} />
                  <Bar dataKey="article_count" name="Articles" fill="var(--series-volume)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Framing — lean, sentiment & drift">
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--gap-columns)" }}>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--gap-columns)" }}>
                <div>
                  <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)", display: "block", marginBottom: "var(--space-sm)" }}>LEAN SHARE BY DAY</span>
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
                  <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)", display: "block", marginBottom: "var(--space-sm)" }}>SENTIMENT, VADER −1…+1</span>
                  {arc.metrics.length < 2 ? (
                    <NeedsMoreDays />
                  ) : (
                    <ResponsiveContainer width="100%" height={140}>
                      <LineChart data={arc.metrics}>
                        {grid}
                        <XAxis dataKey="day" {...axis} />
                        <YAxis domain={[-1, 1]} {...axis} width={32} />
                        <ReferenceLine y={0} stroke="var(--color-muted)" />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Line dataKey="sentiment_mean" name="Sentiment" stroke="var(--series-sentiment)" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)", marginTop: "var(--space-xl)", paddingTop: "var(--space-xl)", borderTop: "1px solid var(--color-rule)" }}>
                <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
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
              <table style={{ width: "100%", fontSize: "var(--text-sm)" }}>
                <thead>
                  <tr style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
                    <th style={{ paddingBottom: "var(--space-xs)", fontWeight: 400, textAlign: "left" }}>Outlet</th>
                    <th style={{ paddingBottom: "var(--space-xs)", fontWeight: 400, textAlign: "right" }}>Art.</th>
                    <th style={{ paddingBottom: "var(--space-xs)", fontWeight: 400, textAlign: "right" }}>Sent.</th>
                    <th style={{ paddingBottom: "var(--space-xs)", fontWeight: 400, textAlign: "right" }}>Lean here</th>
                  </tr>
                </thead>
                <tbody>
                  {outlets?.map((o) => (
                    <tr key={o.domain} style={{ borderTop: "1px solid var(--color-rule)" }}>
                      <td style={{ paddingTop: "var(--space-sm)", paddingBottom: "var(--space-sm)" }}>{o.domain}</td>
                      <td style={{ paddingTop: "var(--space-sm)", paddingBottom: "var(--space-sm)", textAlign: "right", fontFamily: "var(--font-outlier)", fontVariantNumeric: "tabular-nums" }}>{o.article_count}</td>
                      <td style={{ paddingTop: "var(--space-sm)", paddingBottom: "var(--space-sm)", textAlign: "right", fontFamily: "var(--font-outlier)", fontVariantNumeric: "tabular-nums" }}>{fmt(o.sentiment_mean)}</td>
                      <td style={{ paddingTop: "var(--space-sm)", paddingBottom: "var(--space-sm)", textAlign: "right", fontFamily: "var(--font-outlier)", fontVariantNumeric: "tabular-nums", color: "var(--color-muted)" }}>
                        {lean(o.bias_mean)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </section>
      </div>
    </StoryAsk>
  );
}

function statusVar(status: string) {
  return status === "active" || status === "fading" || status === "dead"
    ? `var(--status-${status})`
    : "var(--color-muted)";
}

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

const fmt = (v: number | null) => (v === null ? "–" : v.toFixed(2));
const lean = (v: number | null) =>
  v === null ? "–" : `${v > 0 ? "R" : v < 0 ? "L" : ""}${Math.abs(v).toFixed(2)}`;