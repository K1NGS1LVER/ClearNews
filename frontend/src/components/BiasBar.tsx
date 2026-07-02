type Props = {
  left: number | null;
  center: number | null;
  right: number | null;
  showLabels?: boolean;
};

/** Left/center/right coverage share as a 3-segment bar (2px surface gaps). */
export default function BiasBar({ left, center, right, showLabels }: Props) {
  const l = left ?? 0;
  const c = center ?? 0;
  const r = right ?? 0;
  if (l + c + r === 0) return null;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full gap-[2px]"
        role="img"
        aria-label={`Coverage lean: ${pct(l)} left, ${pct(c)} center, ${pct(r)} right`}
      >
        <div style={{ flexGrow: l, background: "var(--bias-left)" }} />
        <div style={{ flexGrow: c, background: "var(--bias-center)" }} />
        <div style={{ flexGrow: r, background: "var(--bias-right)" }} />
      </div>
      {showLabels && (
        <div className="mt-1 flex justify-between text-xs" style={{ color: "var(--ink-2)" }}>
          <span>◀ {pct(l)} left</span>
          <span>{pct(c)} center</span>
          <span>{pct(r)} right ▶</span>
        </div>
      )}
    </div>
  );
}
