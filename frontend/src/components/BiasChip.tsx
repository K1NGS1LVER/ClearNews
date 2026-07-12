import { withErrorBoundary } from "./ErrorBoundary";

const mono = { fontFamily: "var(--font-mono)" } as const;

function BiasChip({ label }: { label: string | null }) {
  if (!label) return null;
  const bg = label === "left" ? "var(--bias-left)" : label === "right" ? "var(--bias-right)" : "var(--chip-center-bg)";
  const ink = label === "center" ? "var(--chip-center-ink)" : "#fff";
  return (
    <span
      className="w-11 shrink-0 rounded py-0.5 text-center text-[9px] font-semibold uppercase"
      style={{ ...mono, letterSpacing: "0.08em", background: bg, color: ink }}
    >
      {label === "center" ? "CENTR" : label}
    </span>
  );
}

export default withErrorBoundary(BiasChip, "BiasChip");
