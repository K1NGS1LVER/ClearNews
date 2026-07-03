import ChatPanel from "../components/ChatPanel";

export default function Chat() {
  // 64px = sticky header (App.tsx) + this column's own pt-2/pb-4; mobile
  // adds another 64px to clear the fixed bottom tab bar (App.tsx's pb-16).
  return (
    <div className="mx-auto flex h-[calc(100dvh-128px)] max-w-3xl flex-col px-4 pb-4 pt-2 sm:px-8 md:h-[calc(100dvh-64px)]">
      <h1 className="mb-3 shrink-0" style={{ fontFamily: "var(--font-serif)", fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
        Ask about the archive
      </h1>
      <div className="min-h-0 flex-1 rounded-[10px] border p-5" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
        <ChatPanel fill />
      </div>
    </div>
  );
}
