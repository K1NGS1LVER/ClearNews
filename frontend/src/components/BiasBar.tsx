import { withErrorBoundary } from "./ErrorBoundary";

type Props = {
  left: number | null;
  center: number | null;
  right: number | null;
  showLabels?: boolean;
};

/** Left/center/right coverage share as a 3-segment bar (2px surface gaps). */
function BiasBar({ left, center, right, showLabels }: Props) {
  const l = left ?? 0;
  const c = center ?? 0;
  const r = right ?? 0;
  if (l + c + r === 0) return null;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div>
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-[3px] gap-[1.5px]"
        role="img"
        aria-label={`Coverage lean: ${pct(l)} left, ${pct(c)} center, ${pct(r)} right`}
      >
        <div style={{ flexGrow: l, background: "var(--bias-left)" }} />
        <div style={{ flexGrow: c, background: "var(--bias-center)" }} />
        <div style={{ flexGrow: r, background: "var(--bias-right)" }} />
      </div>
      {showLabels && (
        <div
          className="mt-1.5 flex justify-between"
          style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.04em", color: "var(--ink-muted)" }}
        >
          <span>◀ {pct(l)} LEFT</span>
          <span>{pct(c)} CENTER</span>
          <span>{pct(r)} RIGHT ▶</span>
        </div>
      )}
    </div>
  );
}

export default withErrorBoundary(BiasBar, "BiasBar");
