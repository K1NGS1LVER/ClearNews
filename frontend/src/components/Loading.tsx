export default function Loading({ label, compact }: { label?: string; compact?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center w-full ${compact ? "py-6" : "min-h-screen p-8"}`}
      style={{ gap: 12 }}
    >
      <div className="loading-spinner cn-anim" />
      {label && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-muted)" }}>
          {label}
        </p>
      )}
    </div>
  );
}
