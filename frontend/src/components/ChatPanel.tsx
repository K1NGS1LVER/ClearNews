import { useEffect, useRef, useState } from "react";
import { decodeEntities } from "../api";
import { withErrorBoundary } from "./ErrorBoundary";

type Source = {
  article_id: number;
  title: string | null;
  url: string;
  outlet: string;
  bias_label: string | null;
};

type Msg = { role: "user" | "assistant"; content: string; sources?: Source[] };

const mono = { fontFamily: "var(--font-mono)" } as const;

const leanColor = (label: string | null) =>
  label === "left" ? "var(--bias-left)" : label === "right" ? "var(--bias-right)" : "var(--ink-muted)";

/** Render assistant text with [n] citation markers as small mono chips
    that resolve against the message's sources list. */
function CitedText({ content, sources }: { content: string; sources?: Source[] }) {
  const parts = content.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = /^\[(\d+)\]$/.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        const found = sources?.some((s) => s.article_id === Number(m[1]));
        return (
          <span
            key={i}
            style={{
              ...mono,
              fontSize: 10,
              fontWeight: 600,
              background: "var(--chip-center-bg)",
              color: found ? "var(--ink)" : "var(--ink-muted)",
              borderRadius: 4,
              padding: "1px 5px",
              margin: "0 1px",
            }}
          >
            {m[1]}
          </span>
        );
      })}
    </>
  );
}

/** Chat with the ClearNews agent. story_id scopes retrieval to one story.
    fill: stretch to the parent's height instead of a fixed 28rem - used
    when embedded in the floating Ask sidebar/sheet. */
function ChatPanel({ storyId, fill }: { storyId?: number; fill?: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggested, setSuggested] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
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
          } else if (data.type === "error") {
            answer = answer ? `${answer}\n\n${data.message}` : data.message;
            setMessages((ms) => [
              ...ms.slice(0, -1),
              { ...ms[ms.length - 1], content: answer },
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
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((ms) => {
          const last = ms[ms.length - 1];
          return last?.role === "assistant" && !last.content ? ms.slice(0, -1) : ms;
        });
      } else {
        setMessages((ms) => [
          ...ms.slice(0, -1),
          { role: "assistant", content: "Something went wrong. Is the agent configured (GROQ_API_KEY)?" },
        ]);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function clearHistory() {
    if (!window.confirm("Clear this conversation?")) return;
    setMessages([]);
    setSuggested([]);
  }

  return (
    <div className={`flex flex-col ${fill ? "h-full" : "h-[28rem]"}`}>
      {messages.length > 0 && (
        <div className="mb-1 flex shrink-0 justify-end">
          <button
            onClick={clearHistory}
            disabled={busy}
            className="cursor-pointer hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            style={{ fontFamily: "var(--font-mono)", fontSize: "9.5px", letterSpacing: "0.08em", color: "var(--ink-muted)" }}
          >
            CLEAR
          </button>
        </div>
      )}
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
              className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user" ? "self-end" : "self-start border"
              }`}
              style={
                m.role === "user"
                  ? { background: "var(--ink)", color: "var(--surface-1)", borderRadius: "12px 12px 3px 12px" }
                  : { background: "var(--surface-1)", color: "var(--ink)", borderColor: "var(--border)", borderRadius: "12px 12px 12px 3px" }
              }
            >
              {/* some models emit 【id】instead of [id] */}
              {m.content ? (
                <CitedText content={m.content.replace(/【(\d+)】/g, "[$1]")} sources={m.sources} />
              ) : (
                busy && i === messages.length - 1 ? "…" : ""
              )}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2.5 flex flex-col" style={{ borderTop: "1px solid var(--hair)" }}>
                  <span className="pb-1.5 pt-2" style={{ ...mono, fontSize: "9.5px", letterSpacing: "0.08em", color: "var(--ink-muted)" }}>
                    SOURCES — {m.sources.length} ARTICLES
                  </span>
                  {m.sources.map((s) => (
                    <a
                      key={s.article_id}
                      href={`/article/${s.article_id}`}
                      className="flex gap-2 py-1.5"
                      style={{ borderTop: "1px solid var(--hair)" }}
                    >
                      <span style={{ ...mono, fontSize: 10, fontWeight: 600, color: "var(--ink)" }}>{s.article_id}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium" style={{ color: "var(--ink)" }}>
                          {s.title ? decodeEntities(s.title) : s.url}
                        </span>
                        <span style={{ ...mono, fontSize: "9.5px", color: "var(--ink-muted)" }}>
                          <span style={{ color: leanColor(s.bias_label), fontWeight: 600 }}>
                            {(s.bias_label ?? "n/a").toUpperCase()}
                          </span>{" "}
                          · {s.outlet}
                        </span>
                      </span>
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
              className="rounded-lg border px-2.5 py-1 text-xs hover:shadow-sm"
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
          style={{ borderColor: "var(--input-border)", background: "var(--page)", color: "var(--ink)" }}
        />
        <button
          type={busy ? "button" : "submit"}
          onClick={busy ? stop : undefined}
          disabled={!busy && !input.trim()}
          className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
          style={{ background: "var(--ink)", color: "var(--surface-1)" }}
        >
          {busy ? "Stop" : "Send"}
        </button>
      </form>
    </div>
  );
}

export default withErrorBoundary(ChatPanel, "ChatPanel");
