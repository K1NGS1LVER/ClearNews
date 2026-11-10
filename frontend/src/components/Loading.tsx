import { withErrorBoundary } from "./ErrorBoundary";

const mono = { fontFamily: "var(--font-outlier)" } as const;

function Loading({ label, compact }: { label?: string; compact?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center w-full ${compact ? "py-6" : "min-h-screen p-8"}`}
      style={{ gap: "var(--space-md)" }}
    >
      <div className="loading-spinner cn-anim" />
      {label && (
        <p style={{ ...mono, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
          {label}
        </p>
      )}
    </div>
  );
}

export default withErrorBoundary(Loading, "Loading");
