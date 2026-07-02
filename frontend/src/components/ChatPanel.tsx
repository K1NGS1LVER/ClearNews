import { useEffect, useRef, useState } from "react";

type Source = {
  article_id: number;
  title: string | null;
  url: string;
  outlet: string;
  bias_label: string | null;
};

type Msg = { role: "user" | "assistant"; content: string; sources?: Source[] };

/** Chat with the ClearNews agent. story_id scopes retrieval to one story. */
export default function ChatPanel({ storyId }: { storyId?: number }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggested, setSuggested] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (storyId) {
      fetch(`/api/suggest?story_id=${storyId}`)
        .then((r) => r.json())
        .then((d) => setSuggested(d.questions ?? []))
        .catch(() => {});
    }
  }, [storyId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          story_id: storyId ?? null,
        }),
      });
      if (!resp.ok || !resp.body) throw new Error(`chat failed: ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          if (!ev.startsWith("data: ")) continue;
          const data = JSON.parse(ev.slice(6));
          if (data.type === "token") {
            answer += data.content;
            setMessages((ms) => [
              ...ms.slice(0, -1),
              { role: "assistant", content: answer },
            ]);
          } else if (data.type === "sources") {
            setMessages((ms) => [
              ...ms.slice(0, -1),
              { role: "assistant", content: answer, sources: data.sources },
            ]);
          }
        }
      }
      fetch(`/api/suggest?context=${encodeURIComponent(answer.slice(0, 1500))}`)
        .then((r) => r.json())
        .then((d) => setSuggested(d.questions ?? []))
        .catch(() => {});
    } catch {
      setMessages((ms) => [
        ...ms.slice(0, -1),
        { role: "assistant", content: "Something went wrong. Is the agent configured (GROQ_API_KEY)?" },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[28rem] flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm" style={{ color: "var(--ink-muted)" }}>
            Ask about {storyId ? "this story" : "any story in the archive"} - answers cite
            the underlying articles.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user" ? "self-end" : "self-start"
              }`}
              style={{
                background: m.role === "user" ? "var(--bias-left)" : "var(--page)",
                color: m.role === "user" ? "#fff" : "var(--ink)",
              }}
            >
              {m.content || (busy && i === messages.length - 1 ? "…" : "")}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.sources.map((s) => (
                    <a
                      key={s.article_id}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      title={s.title ?? s.url}
                      className="rounded-full border px-2 py-0.5 text-xs hover:underline"
                      style={{ borderColor: "var(--border)", color: "var(--ink-2)" }}
                    >
                      [{s.article_id}] {s.outlet}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {suggested.length > 0 && (
        <div className="flex flex-wrap gap-1.5 py-2">
          {suggested.map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              className="rounded-full border px-2.5 py-1 text-xs hover:shadow-sm"
              style={{ borderColor: "var(--border)", color: "var(--ink-2)", background: "var(--surface-1)" }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={storyId ? "Ask about this story…" : "Ask across all stories…"}
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--bias-left)" }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
