import { BIAS_CONFIDENCE_THRESHOLD } from "../api";
import { withErrorBoundary } from "./ErrorBoundary";

const mono = { fontFamily: "var(--font-mono)" } as const;

/**
 * Renders a per-article bias label chip.
 *
 * When `confidence` is provided and falls below BIAS_CONFIDENCE_THRESHOLD the
 * chip is shown as "?" in muted gray rather than a solid colored label.  This
 * signals that the model (politicalBiasBERT, trained on US text) did not
 * produce a confident prediction — common for non-English or non-Western
 * outlets, and for articles where "center" is really just model uncertainty.
 *
 * When confidence is null/undefined the chip renders normally (legacy rows
 * without stored probs fall back to the label as-is).
 */
function BiasChip({
  label,
  confidence,
}: {
  label: string | null;
  confidence?: number | null;
}) {
  if (!label) return null;

  const uncertain =
    confidence !== undefined &&
    confidence !== null &&
    confidence < BIAS_CONFIDENCE_THRESHOLD;

  const bg = uncertain
    ? "var(--chip-center-bg)"
    : label === "left"
      ? "var(--bias-left)"
      : label === "right"
        ? "var(--bias-right)"
        : "var(--chip-center-bg)";

  const ink =
    uncertain || label === "center" ? "var(--chip-center-ink)" : "#fff";

  const displayLabel = uncertain ? "?" : label === "center" ? "CENTR" : label;

  const tooltipText = uncertain
    ? `Model confidence: ${Math.round((confidence ?? 0) * 100)}% — too low to show lean`
    : label === "center"
      ? "Center lean — or model uncertain between left and right"
      : `${label.charAt(0).toUpperCase() + label.slice(1)} lean (confidence: ${
          confidence !== null && confidence !== undefined
            ? Math.round(confidence * 100) + "%"
            : "unknown"
        })`;

  return (
    <span
      className="w-11 shrink-0 rounded py-0.5 text-center text-[9px] font-semibold uppercase"
      style={{
        ...mono,
        letterSpacing: "0.08em",
        background: bg,
        color: ink,
        opacity: uncertain ? 0.65 : 1,
        cursor: "default",
      }}
      title={tooltipText}
    >
      {displayLabel}
    </span>
  );
}

export default withErrorBoundary(BiasChip, "BiasChip");
