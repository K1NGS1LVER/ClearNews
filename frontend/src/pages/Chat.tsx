import ChatPanel from "../components/ChatPanel";

export default function Chat() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-2 sm:px-8">
      <h1 className="mb-3" style={{ fontFamily: "var(--font-serif)", fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
        Ask about the archive
      </h1>
      <div className="rounded-[10px] border p-5" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
        <ChatPanel />
      </div>
    </div>
  );
}
