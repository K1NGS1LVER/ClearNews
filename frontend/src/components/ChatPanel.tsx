import { useEffect, useRef, useState } from "react";
import { decodeEntities } from "../api";
import { startVad, VAD_SAMPLE_RATE, type VadSession } from "../lib/vad";
import { pcmToWavFile } from "../lib/wav";
import { withErrorBoundary } from "./ErrorBoundary";

type Source = {
  article_id?: number;
  citation_id?: string;
  source_type?: "archive" | "web";
  title: string | null;
  url: string;
  outlet: string;
  bias_label: string | null;
};

type Msg = { role: "user" | "assistant"; content: string; sources?: Source[] };

type VoiceState = "idle" | "listening" | "transcribing";

const mono = { fontFamily: "var(--font-mono)" } as const;

const leanColor = (label: string | null) =>
  label === "left" ? "var(--bias-left)" : label === "right" ? "var(--bias-right)" : "var(--ink-muted)";

/** Render assistant text with [n] archive and [web:n] live-web citation
    markers as small mono chips that resolve against the message's sources
    list. The two stay visually distinct: web chips are outlined, not filled,
    so a reader can tell archive evidence from live-web reporting at a glance. */
function CitedText({ content, sources }: { content: string; sources?: Source[] }) {
  const parts = content.split(/(\[\d+\]|\[web:\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const web = /^\[web:(\d+)\]$/.exec(part);
        const archive = web ? null : /^\[(\d+)\]$/.exec(part);
        if (!web && !archive) return <span key={i}>{part}</span>;
        const label = web ? web[1] : archive![1];
        const found = web
          ? sources?.some((s) => s.citation_id === `web:${label}`)
          : sources?.some((s) => s.article_id === Number(label));
        return (
          <span
            key={i}
            style={{
              ...mono,
              fontSize: 10,
              fontWeight: 600,
              background: web ? "transparent" : "var(--chip-center-bg)",
              border: web ? `1px solid ${found ? "var(--ink-muted)" : "var(--border)"}` : undefined,
              color: found ? "var(--ink)" : "var(--ink-muted)",
              borderRadius: 4,
              padding: web ? "0px 4px" : "1px 5px",
              margin: "0 1px",
            }}
          >
            {web ? `w${label}` : label}
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
  const [sessionId, setSessionId] = useState<number | null>(null);

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const vadRef = useRef<VadSession | null>(null);
  const transcribeAbortRef = useRef<AbortController | null>(null);
  // Replaced with a fresh object by cancelVoice() and the unmount cleanup
  // below - a plain write, deliberately not a `.current++` read-then-write,
  // so a linter checking for stale ref reads in effect cleanups doesn't
  // flag it (this ref is a persistent, manually-managed generation token,
  // not a DOM node ref). startVoice() snapshots the current token before
  // awaiting startVad() (mic permission + asset load - can take a while)
  // and compares it by reference after; a mismatch means the user
  // cancelled or the component unmounted while that promise was in
  // flight, so the just-created session must be stopped immediately
  // instead of being stored in vadRef/surfaced in the UI.
  const voiceGenRef = useRef({});

  // Release the mic if the panel unmounts (e.g. navigation) mid-recording.
  useEffect(() => {
    return () => {
      voiceGenRef.current = {};
      vadRef.current?.stop();
    };
  }, []);

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
      let activeSessionId = sessionId;
      if (activeSessionId === null) {
        const created = await fetch("/api/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ story_id: storyId ?? null }),
        });
        if (!created.ok) throw new Error(`session failed: ${created.status}`);
        activeSessionId = (await created.json()).id;
        setSessionId(activeSessionId);
      }
      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          session_id: activeSessionId,
          content: text,
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

  /** Arm the mic + VAD. Mirrors send()'s guard: don't start while an
      answer is already streaming. */
  async function startVoice() {
    if (busy || voiceState !== "idle") return;
    setVoiceError(null);
    setVoiceState("listening");
    const gen = voiceGenRef.current;
    try {
      const session = await startVad(handleSpeechEnd);
      if (voiceGenRef.current !== gen) {
        // Cancelled or unmounted while startVad()'s mic-permission/asset
        // load was still pending - a live session just landed after the
        // fact. Stop it immediately rather than arming a mic the UI no
        // longer shows as listening, and leave voiceState/vadRef alone
        // since the cancel/unmount path already reset them.
        session.stop();
        return;
      }
      vadRef.current = session;
    } catch (err) {
      if (voiceGenRef.current !== gen) return; // same race, on the rejection path
      vadRef.current = null;
      setVoiceState("idle");
      setVoiceError(
        err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
          ? "Microphone access was denied."
          : "Couldn't start voice input.",
      );
    }
  }

  /** Manual cancel, available for the whole listening/transcribing
      lifetime - both an accessibility requirement and a fallback for VAD
      misfires or a mid-recording change of mind. */
  function cancelVoice() {
    voiceGenRef.current = {};
    vadRef.current?.stop();
    vadRef.current = null;
    transcribeAbortRef.current?.abort();
    transcribeAbortRef.current = null;
    setVoiceState("idle");
  }

  /** VAD's onSpeechEnd: package the captured clip, upload it for
      transcription, and hand the transcript to the same send() the typed
      input and suggested-question buttons use. */
  async function handleSpeechEnd(audio: Float32Array) {
    vadRef.current?.stop();
    vadRef.current = null;
    setVoiceState("transcribing");

    const controller = new AbortController();
    transcribeAbortRef.current = controller;
    try {
      const form = new FormData();
      form.append("file", pcmToWavFile(audio, VAD_SAMPLE_RATE));
      const resp = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!resp.ok) {
        if (resp.status === 401) throw new Error("Please log in to use voice input.");
        if (resp.status === 413) throw new Error("Recording too long - try a shorter clip.");
        if (resp.status === 503) throw new Error("Voice transcription is unavailable right now.");
        throw new Error(`transcribe failed: ${resp.status}`);
      }
      const data = await resp.json();
      const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
      setVoiceState("idle");
      if (transcript) {
        send(transcript);
      } else {
        setVoiceError("Didn't catch anything - try again.");
      }
    } catch (err) {
      setVoiceState("idle");
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setVoiceError(err instanceof Error ? err.message : "Voice transcription failed.");
      }
    } finally {
      transcribeAbortRef.current = null;
    }
  }

  function clearHistory() {
    if (!window.confirm("Clear this conversation?")) return;
    if (sessionId !== null) fetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE" }).catch(() => {});
    setMessages([]);
    setSessionId(null);
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
                    SOURCES — {m.sources.length}
                  </span>
                  {m.sources.map((s) => {
                    const isWeb = s.source_type === "web";
                    return (
                      <a
                        key={s.article_id ?? s.citation_id}
                        href={isWeb ? s.url : `/article/${s.article_id}`}
                        target={isWeb ? "_blank" : undefined}
                        rel={isWeb ? "noreferrer" : undefined}
                        className="flex gap-2 py-1.5"
                        style={{ borderTop: "1px solid var(--hair)" }}
                      >
                        <span style={{ ...mono, fontSize: 10, fontWeight: 600, color: "var(--ink)" }}>
                          {isWeb ? `w${s.citation_id?.split(":")[1]}` : s.article_id}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium" style={{ color: "var(--ink)" }}>
                            {s.title ? decodeEntities(s.title) : s.url}
                          </span>
                          <span style={{ ...mono, fontSize: "9.5px", color: "var(--ink-muted)" }}>
                            {isWeb ? (
                              <span style={{ color: "var(--ink-muted)", fontWeight: 600 }}>LIVE WEB</span>
                            ) : (
                              <span style={{ color: leanColor(s.bias_label), fontWeight: 600 }}>
                                {(s.bias_label ?? "n/a").toUpperCase()}
                              </span>
                            )}{" "}
                            · {s.outlet}
                          </span>
                        </span>
                      </a>
                    );
                  })}
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

      <div className="mt-2 flex flex-col gap-1">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy || voiceState !== "idle"}
            placeholder={storyId ? "Ask about this story…" : "Ask across all stories…"}
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 disabled:opacity-40"
            style={{ borderColor: "var(--input-border)", background: "var(--page)", color: "var(--ink)" }}
          />
          <button
            type="button"
            onClick={voiceState === "idle" ? startVoice : cancelVoice}
            disabled={voiceState === "idle" && busy}
            aria-label={
              voiceState === "idle" ? "Record a voice question" : voiceState === "listening" ? "Stop recording" : "Cancel"
            }
            className="shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            style={
              voiceState === "idle"
                ? { borderColor: "var(--input-border)", background: "var(--page)", color: "var(--ink)" }
                : { borderColor: "transparent", background: "var(--ink)", color: "var(--surface-1)" }
            }
          >
            {voiceState === "listening" && (
              <span className="animate-pulse" style={{ ...mono, letterSpacing: "0.04em" }}>
                ● REC
              </span>
            )}
            {voiceState === "transcribing" && (
              <span className="loading-spinner cn-anim" style={{ width: 14, height: 14 }} />
            )}
            {voiceState === "idle" && "Mic"}
          </button>
          <button
            type={busy ? "button" : "submit"}
            onClick={busy ? stop : undefined}
            disabled={!busy && (voiceState !== "idle" || !input.trim())}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
            style={{ background: "var(--ink)", color: "var(--surface-1)" }}
          >
            {busy ? "Stop" : "Send"}
          </button>
        </form>
        {voiceError && (
          <p className="text-xs" style={{ color: "var(--bias-right)" }}>
            {voiceError}
          </p>
        )}
      </div>
    </div>
  );
}

export default withErrorBoundary(ChatPanel, "ChatPanel");
