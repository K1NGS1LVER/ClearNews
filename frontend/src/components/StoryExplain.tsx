import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  type BiasLabel,
  type ExplanationAggregate,
  type ExplanationArticle,
  type StoryExplanation,
  decodeEntities,
  fetchStoryExplanation,
  stepStoryExplanation,
} from "../api";
import BiasBar from "./BiasBar";
import BiasChip from "./BiasChip";
import { withErrorBoundary } from "./ErrorBoundary";

const mono = { fontFamily: "var(--font-outlier)" } as const;
const serif = { fontFamily: "var(--font-body)" } as const; // Using body instead of serif per Hallmark
const BIAS_ORDER: BiasLabel[] = ["left", "center", "right"];
const classVar = (l: BiasLabel) => `var(--bias-${l})`;

const axis = { stroke: "var(--color-rule)", fontSize: 11, tickLine: false, tick: { fill: "var(--color-muted)" } } as const;
const tooltipStyle = {
  background: "var(--color-paper)",
  border: "1px solid var(--color-rule)",
  borderRadius: "var(--radius-input)",
  fontSize: "var(--text-sm)",
};

function StoryExplain({ storyId }: { storyId: number }) {
  const [state, setState] = useState<StoryExplanation | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    fetchStoryExplanation(storyId).then(setState).catch(() => {});
    return () => {
      cancelled.current = true;
    };
  }, [storyId]);

  async function runLoop(refresh: boolean) {
    setRunning(true);
    setError(null);
    try {
      let current = await stepStoryExplanation(storyId, refresh);
      if (cancelled.current) return;
      setState(current);
      while (current.status !== "complete") {
        current = await stepStoryExplanation(storyId, false);
        if (cancelled.current) return;
        setState(current);
      }
    } catch (e) {
      if (!cancelled.current) {
        setError(e instanceof Error ? e.message : "Could not compute this explanation.");
      }
    } finally {
      if (!cancelled.current) setRunning(false);
    }
  }

  if (!state) return null;

  if (state.status === "none" && !running) {
    if (state.eligible === 0) {
      return (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
          No labeled articles yet — check back once coverage has been processed.
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)" }}>
          See which words in the coverage pushed the model toward each lean label.
        </p>
        <button
          type="button"
          onClick={() => runLoop(false)}
          className="w-fit rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer transition-opacity hover:opacity-80"
          style={{
            ...mono,
            letterSpacing: "0.06em",
            background: "var(--chip-center-bg)",
            color: "var(--chip-center-ink)",
            borderRadius: "var(--radius-input)",
            padding: "var(--space-xs) var(--space-md)",
            fontSize: "var(--text-xs)",
            fontFamily: "var(--font-outlier)",
            fontWeight: 700,
          }}
        >
          EXPLAIN THIS STORY'S LEAN · UP TO {Math.min(state.eligible, 5)} ARTICLES (~1-3 MIN)
        </button>
        {error && (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--bias-right)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // before the first step response lands, `state` may still be the pre-run
  // "none" snapshot (total 0) - fall back to the known eligible count so the
  // progress line never flashes "0/0"
  const expectedTotal = state.total || Math.min(state.eligible, 5);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {running ? (
          <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.06em", color: "var(--color-muted)" }}>
            ANALYZING · {state.analyzed}/{expectedTotal} ARTICLES…
          </span>
        ) : (
          <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.06em", color: "var(--color-muted)" }}>
            BASED ON {state.analyzed} ARTICLE{state.analyzed === 1 ? "" : "S"}
            {state.as_of && ` · AS OF ${new Date(state.as_of).toLocaleDateString()}`}
          </span>
        )}
        {!running && state.stale && (
          <button
            type="button"
            onClick={() => runLoop(true)}
            className="hover:opacity-70 cursor-pointer"
            style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.06em", color: "var(--color-ink-2)" }}
          >
            RECOMPUTE WITH NEWER ARTICLES ↻
          </button>
        )}
      </div>

      {error && (
        <p style={{ fontSize: "var(--text-xs)", color: "var(--bias-right)" }}>
          {error}
        </p>
      )}

      {state.aggregate && (
        <>
          <div className="max-w-[420px]">
            <BiasBar
              left={state.aggregate.probs.left}
              center={state.aggregate.probs.center}
              right={state.aggregate.probs.right}
              showLabels
            />
            <p className="mt-1.5" style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.04em", color: "var(--color-muted)" }}>
              MEAN MODEL CONFIDENCE ACROSS ANALYZED ARTICLES — THE HONEST BASIS FOR A "CENTER" LABEL
            </p>
          </div>

          <TopWordsChart aggregate={state.aggregate} />
        </>
      )}

      <ul className="flex flex-col">
        {state.articles.map((a, i) => (
          <ExplanationRow
            key={a.id}
            article={a}
            first={i === 0}
            expanded={expandedId === a.id}
            onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
          />
        ))}
      </ul>

      {state.aggregate && (
        <p style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.04em", color: "var(--color-muted)" }}>
          SHAP PARTITION VALUES · SHADING = PUSH TOWARD EACH ARTICLE'S PREDICTED LABEL
        </p>
      )}
    </div>
  );
}

function TopWordsChart({ aggregate }: { aggregate: ExplanationAggregate }) {
  const present = BIAS_ORDER.filter((l) => aggregate.top_words[l]?.length);
  if (!present.length) return null;
  return (
    <div>
      <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
        TOP WORDS PUSHING EACH LABEL
      </span>
      <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {present.map((label) => {
          const data = aggregate.top_words[label].slice(0, 6).map((w) => ({ word: w.word, value: w.value }));
          return (
            <div key={label}>
              <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.06em", color: classVar(label) }}>
                {label.toUpperCase()}
              </span>
              <ResponsiveContainer width="100%" height={Math.max(90, data.length * 26)}>
                <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="word" width={82} {...axis} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => Number(v).toFixed(3)} />
                  <Bar dataKey="value" radius={3} maxBarSize={12}>
                    {data.map((d) => (
                      <Cell key={d.word} fill={classVar(label)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExplanationRow({
  article,
  first,
  expanded,
  onToggle,
}: {
  article: ExplanationArticle;
  first: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 py-2.5" style={{ borderTop: first ? "none" : "1px solid var(--color-rule)" }}>
      <div className="flex items-center gap-3">
        <BiasChip
          label={article.bias_label}
          confidence={article.probs ? Math.max(...Object.values(article.probs)) : undefined}
        />
        <Link
          to={`/article/${article.id}`}
          className="min-w-0 flex-1 truncate hover:underline"
          style={{ fontSize: "var(--text-base)", fontWeight: 500, color: "var(--color-ink)" }}
        >
          {article.title ? decodeEntities(article.title) : `Article ${article.id}`}
        </Link>
        {article.explained && article.probs ? (
          <button
            type="button"
            onClick={onToggle}
            className="shrink-0 hover:opacity-70 cursor-pointer"
            style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.05em", color: "var(--color-muted)" }}
          >
            {probsLabel(article.probs)} {expanded ? "▲" : "▼"}
          </button>
        ) : (
          <span className="shrink-0" style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.05em", color: "var(--color-muted)" }}>
            QUEUED…
          </span>
        )}
      </div>
      {expanded && article.tokens && article.values && article.predicted && (
        <HighlightedText tokens={article.tokens} values={article.values} predicted={article.predicted} />
      )}
    </li>
  );
}

function probsLabel(probs: Record<BiasLabel, number>) {
  return `L${Math.round(probs.left * 100)} C${Math.round(probs.center * 100)} R${Math.round(probs.right * 100)}`;
}

function HighlightedText({
  tokens,
  values,
  predicted,
}: {
  tokens: string[];
  values: [number, number, number][];
  predicted: BiasLabel;
}) {
  const classIdx = BIAS_ORDER.indexOf(predicted);
  const maxAbs = Math.max(0.001, ...values.map((v) => Math.abs(v[classIdx])));
  return (
    <div
      className="max-h-56 overflow-y-auto rounded-md p-3"
      style={{ ...serif, fontSize: "var(--text-base)", lineHeight: 1.7, color: "var(--color-ink)", background: "var(--color-paper)", border: "1px solid var(--color-rule)", borderRadius: "var(--radius-input)", padding: "var(--space-md)" }}
    >
      {tokens.map((t, i) => {
        const v = values[i][classIdx];
        const pct = Math.round((55 * Math.abs(v)) / maxAbs);
        if (pct <= 3) return <span key={i}>{t}</span>;
        const color = v >= 0 ? classVar(predicted) : "var(--color-muted)";
        return (
          <span key={i} style={{ background: `color-mix(in srgb, ${color} ${pct}%, transparent)` }}>
            {t}
          </span>
        );
      })}
    </div>
  );
}

export default withErrorBoundary(StoryExplain, "StoryExplain");
