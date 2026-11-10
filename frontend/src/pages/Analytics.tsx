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

const mono = { fontFamily: "var(--font-outlier)" } as const;
const display = { fontFamily: "var(--font-display)" } as const;

type Analytics = {
  stories_by_status: Record<string, number>;
  articles_by_bias: Record<string, number>;
  avg_story_lifespan_days: number | null;
  by_category: { category: string; stories: number; avg_lifespan_days: number }[];
  top_death_risk: { story_id: number; title: string; death_risk: number }[];
  top_outlets: { domain: string; articles: number; mean_bias: number | null }[];
};

/* Focus and active state helpers for Hallmark Floor 26a & Reflex 26b */
const focusStyle = {
  outline: "2px solid var(--color-focus)",
  outlineOffset: "2px",
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

function Stat({ value, label, dot }: { value: string; label: string; dot?: string }) {
  return (
    <article
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
      <div style={{ ...display, fontSize: "var(--text-2xl)", fontWeight: 600, color: "var(--color-ink)" }}>{value}</div>
      <div style={{ marginTop: "var(--space-xs)", ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: dot ?? "var(--color-muted)" }}>
        {dot ? <span style={{ color: dot, marginRight: "var(--space-xs)" }}>●</span> : <span style={{ marginRight: "var(--space-xs)" }}>○</span>}{label}
      </div>
    </article>
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
    <div style={{ minHeight: "100vh", background: "var(--color-paper)", color: "var(--color-ink)" }}>
      <section style={{ paddingTop: "var(--space-xl)", paddingBottom: "var(--space-lg)" }}>
        <div className="container">
          <h1 style={{ ...display, fontSize: "var(--text-section)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--color-ink)", marginBottom: "var(--space-xl)" }}>
            Analytics
          </h1>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-md)" }}>
            <Stat value={String(status.active ?? 0)} label="ACTIVE STORIES" dot="var(--status-active)" />
            <Stat value={String(status.fading ?? 0)} label="FADING" dot="var(--status-fading)" />
            <Stat value={String(status.dead ?? 0)} label="DEAD (ARCHIVE)" />
            <Stat value={(data.avg_story_lifespan_days ?? 0).toFixed(1)} label="AVG STORY LIFESPAN (D)" />
          </div>
        </div>
      </section>

      <section style={{ paddingBottom: "var(--section-gap)" }}>
        <div className="container">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
            <Panel title="Political lean across all coverage">
              <BiasBar
                left={(bias.left ?? 0) / totalBias}
                center={(bias.center ?? 0) / totalBias}
                right={(bias.right ?? 0) / totalBias}
                showLabels
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-md)", ...mono, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                <span>{bias.left ?? 0} articles</span>
                <span>{bias.center ?? 0} articles</span>
                <span>{bias.right ?? 0} articles</span>
              </div>
            </Panel>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-xl)" }}>
              <Panel title="Stories by category">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.by_category}>
                    <CartesianGrid stroke="var(--color-rule)" vertical={false} />
                    <XAxis dataKey="category" stroke="var(--color-rule)" fontSize={11} tickLine={false} tick={{ fill: "var(--color-muted)" }} />
                    <YAxis allowDecimals={false} stroke="var(--color-rule)" fontSize={11} tickLine={false} width={28} tick={{ fill: "var(--color-muted)" }} />
                    <Tooltip
                      contentStyle={{ background: "var(--color-paper)", border: "1px solid var(--color-rule)", borderRadius: "var(--radius-input)", fontSize: "var(--text-sm)" }}
                      cursor={{ fill: "var(--color-rule)" }}
                    />
                    <Bar dataKey="stories" name="Stories" fill="var(--series-volume)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              {data.top_death_risk.length > 0 && (
                <Panel title="Stories at risk of dying" hint="XGBOOST MODEL">
                  <ul style={{ display: "flex", flexDirection: "column" }}>
                    {data.top_death_risk.map((s, i) => (
                      <li key={s.story_id} style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", paddingTop: "var(--space-sm)", paddingBottom: "var(--space-sm)", borderTop: i === 0 ? "none" : "1px solid var(--color-rule)" }}>
                        <span
                          style={{
                            minWidth: "60px",
                            textAlign: "right",
                            fontFamily: "var(--font-outlier)",
                            fontVariantNumeric: "tabular-nums",
                            fontSize: "var(--text-sm)",
                            fontWeight: 600,
                            color: s.death_risk > 0.7 ? "var(--bias-right)" : "var(--color-ink-2)",
                          }}
                        >
                          {Math.round(s.death_risk * 100)}%
                        </span>
                        <Link
                          to={`/story/${s.story_id}`}
                          title={decodeEntities(s.title)}
                          style={{
                            minWidth: 0,
                            flex: 1,
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            fontSize: "var(--text-sm)",
                            color: "var(--color-ink)",
                            textDecoration: "none",
                            transition: "text-decoration var(--dur-micro) var(--ease-out)",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = "none"; }}
                          onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
                          onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
                        >
                          {decodeEntities(s.title)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p style={{ marginTop: "var(--space-sm)", ...mono, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                    XGBOOST MODEL · P(STORY FADES WITHIN 30 DAYS)
                  </p>
                </Panel>
              )}
            </div>

            <Panel title="Outlet landscape — proximity = similar coverage">
              <OutletMap />
            </Panel>

            <Panel title="Most active outlets">
              <table style={{ width: "100%", fontSize: "var(--text-sm)" }}>
                <thead>
                  <tr style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
                    <th style={{ paddingBottom: "var(--space-xs)", fontWeight: 400, textAlign: "left" }}>Outlet</th>
                    <th style={{ paddingBottom: "var(--space-xs)", fontWeight: 400, textAlign: "right" }}>Articles</th>
                    <th style={{ paddingBottom: "var(--space-xs)", fontWeight: 400, textAlign: "right" }}>Mean lean</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_outlets.map((o) => (
                    <tr key={o.domain} style={{ borderTop: "1px solid var(--color-rule)" }}>
                      <td style={{ paddingTop: "var(--space-sm)", paddingBottom: "var(--space-sm)" }}>{o.domain}</td>
                      <td style={{ paddingTop: "var(--space-sm)", paddingBottom: "var(--space-sm)", textAlign: "right", fontFamily: "var(--font-outlier)", fontVariantNumeric: "tabular-nums" }}>{o.articles}</td>
                      <td style={{ paddingTop: "var(--space-sm)", paddingBottom: "var(--space-sm)", textAlign: "right", fontFamily: "var(--font-outlier)", fontVariantNumeric: "tabular-nums" }}>
                        {o.mean_bias === null ? "–" : `${o.mean_bias > 0 ? "R" : "L"}${Math.abs(o.mean_bias).toFixed(2)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </div>
      </section>
    </div>
  );
}