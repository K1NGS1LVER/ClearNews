import ChatPanel from "../components/ChatPanel";

export default function Chat() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div
        className="rounded-lg border p-4"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <h1 className="mb-2 text-sm font-semibold" style={{ color: "var(--ink-2)" }}>
          Research assistant · full archive
        </h1>
        <ChatPanel />
      </div>
    </div>
  );
}
