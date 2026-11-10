import { useState } from "react";

const mono = { fontFamily: "var(--font-outlier)" } as const;
const body = { fontFamily: "var(--font-body)" } as const;

/**
 * Collapsible plain-English note about the limitations of the political bias
 * classifier. Placed below BiasBar on the Story page.
 *
 * Adapts its content based on:
 * - centerShare: when dominant it names the "uncertainty" problem specifically
 * - hasNonEnglishOutlets: when true it names the geographic applicability gap
 */
export default function BiasConfidenceNote({
  centerShare,
  hasNonEnglishOutlets = false,
}: {
  centerShare: number | null;
  hasNonEnglishOutlets?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = "var(--color-muted)";

  const centerPct =
    centerShare !== null ? Math.round(centerShare * 100) : null;
  const centerHigh = centerPct !== null && centerPct > 40;

  return (
    <div className="mt-2.5" style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.05em", color }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="cursor-pointer transition-opacity hover:opacity-70"
        style={{ color, textDecoration: "underline", textDecorationStyle: "dotted", background: "none", border: "none", padding: 0, font: "inherit" }}
        aria-expanded={expanded}
      >
        ⓘ ABOUT THESE LEAN LABELS {expanded ? "▲" : "▼"}
      </button>

      {expanded && (
        <div
          className="mt-2.5 flex flex-col gap-2"
          style={{
            ...body,
            fontSize: "var(--text-sm)",
            lineHeight: 1.65,
            color: "var(--color-ink-2)",
            background: "var(--color-paper)",
            border: "1px solid var(--color-rule)",
            borderRadius: "var(--radius-input)",
            padding: "var(--space-md) var(--space-lg)",
            maxWidth: 520,
          }}
        >
          <p>
            Labels are produced by{" "}
            <span style={{ fontWeight: 600 }}>politicalBiasBERT</span>, a
            classifier trained on US political news text. Each article's chip
            shows{" "}
            <span
              style={{
                ...mono,
                fontSize: "var(--text-xs)",
                fontWeight: 700,
                letterSpacing: "0.06em",
              }}
            >
              ?
            </span>{" "}
            instead of a colored label when model confidence falls below 60% —
            the threshold where the prediction is too uncertain to be
            meaningful.
          </p>

          {centerHigh && (
            <p>
              This story's center share ({centerPct}%) is high, which often
              means the model was{" "}
              <span style={{ fontWeight: 600 }}>split between left and right</span>{" "}
              rather than genuinely classifying coverage as centrist. Use the
              SHAP explanation below to inspect individual articles and see
              which words drove the prediction.
            </p>
          )}

          {hasNonEnglishOutlets && (
            <p>
              This story includes outlets from outside the US or UK.
              Left/right is a Western journalistic frame — scores for
              non-Western sources are approximate indicators of editorial
              tone, not direct political alignment.
            </p>
          )}

          <p style={{ color: "var(--color-muted)", fontSize: "var(--text-xs)" }}>
            The SHAP explanation panel (below) shows the specific words that
            pushed each label — always more informative than the aggregate bar.
          </p>
        </div>
      )}
    </div>
  );
}