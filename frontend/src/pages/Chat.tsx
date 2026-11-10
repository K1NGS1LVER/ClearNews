import ChatPanel from "../components/ChatPanel";

const display = { fontFamily: "var(--font-display)" } as const;

export default function Chat() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-paper)", color: "var(--color-ink)" }}>
      <section style={{ paddingTop: "var(--space-xl)", paddingBottom: "var(--space-lg)" }}>
        <div className="container" style={{ maxWidth: "720px" }}>
          <h1 style={{ ...display, fontSize: "var(--text-section)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--color-ink)", marginBottom: "var(--space-xl)" }}>
            Ask about the archive
          </h1>
          <div
            style={{
              background: "var(--color-paper)",
              border: "1px solid var(--color-rule)",
              borderRadius: "var(--radius-card)",
              padding: "var(--space-xl)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <ChatPanel fill />
          </div>
        </div>
      </section>
    </div>
  );
}