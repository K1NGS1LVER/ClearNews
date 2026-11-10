import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createChatSession, decodeEntities, deleteChatSession, fetchStories, fetchSuggestions, postChat, transcribeVoice, type StoryCard } from "../api";
import { createSpeechQueue, extractCompleteSentences, playText, type SpeechQueue } from "../lib/tts";
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

const mono = { fontFamily: "var(--font-outlier)" } as const;

/** Curated archive-level inquiry prompts for the global chat empty state.
 *  These guide the user toward ClearNews' core analytical capabilities:
 *  cross-spectrum divergence, international developments, active reporting, and media drift. */
export const GLOBAL_SUGGESTED_QUESTIONS = [
  "Which stories show the biggest divergence between left and right coverage?",
  "Summarize recent developments in international relations across the archive.",
  "What are the most active stories being reported today?",
  "Which topics have experienced notable media drift over the past week?",
];

const leanColor = (label: string | null) =>
  label === "left" ? "var(--bias-left)" : label === "right" ? "var(--bias-right)" : "var(--color-muted)";

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
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              background: web ? "transparent" : "var(--chip-center-bg)",
              border: web ? `1px solid ${found ? "var(--color-muted)" : "var(--color-rule)"}` : undefined,
              color: found ? "var(--color-ink)" : "var(--color-muted)",
              borderRadius: "var(--radius-input)",
              padding: web ? "0 var(--space-xs)" : "var(--space-2xs) var(--space-xs)",
              margin: "0 var(--space-2xs)",
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
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const vadRef = useRef<VadSession | null>(null);
  const transcribeAbortRef = useRef<AbortController | null>(null);
  const voiceGenRef = useRef({});
  const audioContextRef = useRef<AudioContext | null>(null);
  const speechQueueRef = useRef<SpeechQueue | null>(null);

  useEffect(() => {
    return () => {
      voiceGenRef.current = {};
      vadRef.current?.stop();
      speechQueueRef.current?.stop();
      void audioContextRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (storyId) {
      fetchSuggestions({ story_id: storyId })
        .then((d) => setSuggested(d.questions ?? []))
        .catch(() => {});
    }
  }, [storyId]);

  const { data: trendingStories } = useQuery<StoryCard[]>({
    queryKey: ["trendingAskStories"],
    queryFn: () => fetchStories({ limit: 4, status: "active" }),
    enabled: !storyId && messages.length === 0,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(text: string, opts?: { speak?: boolean }) {
    if (!text.trim() || busy) return;
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);

    stopSpeaking();
    speechQueueRef.current =
      opts?.speak && audioContextRef.current ? createSpeechQueue(audioContextRef.current) : null;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let activeSessionId = sessionId;
      if (activeSessionId === null) {
        const created = await createChatSession(storyId ?? null);
        activeSessionId = created.id;
        setSessionId(activeSessionId);
      }
      const resp = await postChat(activeSessionId!, text, controller.signal);
      if (!resp.body) {
        throw new Error("No response body");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      let spokenUpTo = 0;

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
            if (speechQueueRef.current) {
              const { sentences, rest } = extractCompleteSentences(answer.slice(spokenUpTo));
              for (const sentence of sentences) speechQueueRef.current.enqueue(sentence);
              spokenUpTo = answer.length - rest.length;
            }
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
      if (speechQueueRef.current) {
        const rest = answer.slice(spokenUpTo).trim();
        if (rest) speechQueueRef.current.enqueue(rest);
      }
      fetchSuggestions({ context: answer.slice(0, 1500) })
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
          { role: "assistant", content: err instanceof Error ? err.message : "Something went wrong. Please try again." },
        ]);
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stopSpeaking() {
    speechQueueRef.current?.stop();
    speechQueueRef.current = null;
    setPlayingIndex(null);
  }

  function speakMessage(index: number, text: string) {
    if (!text.trim()) return;
    stopSpeaking();

    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }

    setPlayingIndex(index);
    speechQueueRef.current = playText(text, audioContextRef.current, () => {
      setPlayingIndex((curr) => (curr === index ? null : curr));
    });
  }

  function stop() {
    abortRef.current?.abort();
    stopSpeaking();
  }

  async function startVoice() {
    if (busy || voiceState !== "idle") return;
    setVoiceError(null);
    setVoiceState("listening");

    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }

    setIsSpeaking(false);
    const gen = voiceGenRef.current;
    try {
      const session = await startVad(
        handleSpeechEnd,
        () => setIsSpeaking(true),
        {
          vadMisfire: () => setIsSpeaking(false),
          frameProcessed: (probs) => {
            if (probs.isSpeech > 0.6) setIsSpeaking(true);
            else if (probs.isSpeech < 0.25) setIsSpeaking(false);
          },
        },
      );
      if (voiceGenRef.current !== gen) {
        session.stop();
        return;
      }
      vadRef.current = session;
    } catch (err) {
      if (voiceGenRef.current !== gen) return;
      vadRef.current = null;
      setIsSpeaking(false);
      setVoiceState("idle");
      setVoiceError(
        err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
          ? "Microphone access was denied."
          : "Couldn't start voice input.",
      );
    }
  }

  function cancelVoice() {
    voiceGenRef.current = {};
    setIsSpeaking(false);
    vadRef.current?.stop();
    vadRef.current = null;
    transcribeAbortRef.current?.abort();
    transcribeAbortRef.current = null;
    setVoiceState("idle");
  }

  async function handleSpeechEnd(audio: Float32Array) {
    setIsSpeaking(false);
    vadRef.current?.stop();
    vadRef.current = null;
    setVoiceState("transcribing");

    const controller = new AbortController();
    transcribeAbortRef.current = controller;
    try {
      const form = new FormData();
      form.append("file", pcmToWavFile(audio, VAD_SAMPLE_RATE));
      const data = await transcribeVoice(form, controller.signal);
      const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
      setVoiceState("idle");
      if (transcript) {
        send(transcript, { speak: true });
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
    stopSpeaking();
    if (sessionId !== null) deleteChatSession(sessionId);
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
            style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}
          >
            CLEAR
          </button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="flex flex-col gap-5 py-2" data-testid="ask-empty-state">
            <div className="text-center sm:text-left">
              <p className="text-xs sm:text-sm" style={{ color: "var(--color-muted)" }}>
                Ask about {storyId ? "this story" : "any story in the archive"} — answers cite the underlying articles across perspectives.
              </p>
            </div>

            <div className="flex flex-col gap-2" data-testid="suggested-questions-section">
              <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
                SUGGESTED QUESTIONS
              </span>
              <div className="flex flex-wrap gap-2">
                {(storyId ? (suggested.length > 0 ? suggested : []) : GLOBAL_SUGGESTED_QUESTIONS).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    disabled={busy}
                    data-testid="suggested-question-pill"
                    className="cursor-pointer rounded-full border px-3 py-1.5 text-left text-xs transition-colors hover:border-[var(--color-ink)] disabled:opacity-40"
                    style={{
                      borderColor: "var(--color-rule)",
                      background: "var(--color-paper)",
                      color: "var(--color-ink)",
                      borderRadius: "var(--radius-pill)",
                      fontSize: "var(--text-xs)",
                      fontFamily: "var(--font-body)",
                      fontWeight: 500,
                    }}
                  >
                    <span style={{ color: "var(--color-accent)", marginRight: 5 }}>✦</span>
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {!storyId && trendingStories && trendingStories.length > 0 && (
              <div
                className="flex flex-col gap-2 border-t pt-3.5"
                style={{ borderColor: "var(--color-rule)" }}
                data-testid="trending-stories-section"
              >
                <div className="flex items-center justify-between">
                  <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
                    EXPLORE TOP STORIES
                  </span>
                  <span className="hidden sm:inline" style={{ ...mono, fontSize: "var(--text-2xs)", letterSpacing: "0.04em", color: "var(--color-muted)" }}>
                    ASK AGENT
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {trendingStories.map((story) => (
                    <button
                      key={story.id}
                      type="button"
                      onClick={() =>
                        send(
                          `What are the main viewpoints and differences in coverage regarding: "${decodeEntities(story.agent_headline || story.title)}"?`
                        )
                      }
                      disabled={busy}
                      data-testid="trending-story-card"
                      className="group flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:border-[var(--color-muted)] hover:bg-black/[0.02] dark:hover:bg-white/[0.03] disabled:opacity-40"
                      style={{
                        borderColor: "var(--color-rule)",
                        background: "transparent",
                        borderRadius: "var(--radius-input)",
                        padding: "var(--space-sm) var(--space-md)",
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center gap-1.5" style={{ ...mono, fontSize: "var(--text-2xs)", color: "var(--color-muted)" }}>
                          <span>{story.article_count} ARTICLES</span>
                          <span>·</span>
                          <span>{story.status.toUpperCase()}</span>
                        </div>
                        <span
                          className="line-clamp-1 text-xs leading-snug group-hover:underline"
                          style={{ color: "var(--color-ink)", fontWeight: 500, fontFamily: "var(--font-body)" }}
                        >
                          {decodeEntities(story.agent_headline || story.title)}
                        </span>
                      </div>
                      <span
                        className="shrink-0 text-xs transition-transform group-hover:translate-x-0.5"
                        style={{ ...mono, color: "var(--color-muted)" }}
                        aria-hidden="true"
                      >
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "self-end" : "self-start border"}`}
              style={
                m.role === "user"
                  ? { background: "var(--color-ink)", color: "var(--color-paper)", borderRadius: "12px 12px 3px 12px" }
                  : { background: "var(--color-paper)", color: "var(--color-ink)", borderColor: "var(--color-rule)", borderRadius: "12px 12px 12px 3px" }
              }
            >
              {m.content ? (
                <CitedText content={m.content.replace(/【(\d+)】/g, "[$1]")} sources={m.sources} />
              ) : (
                busy && i === messages.length - 1 ? "…" : ""
              )}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2.5 flex flex-col" style={{ borderTop: "1px solid var(--color-rule)" }}>
                  <span className="pb-1.5 pt-2" style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>
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
                        style={{ borderTop: "1px solid var(--color-rule)" }}
                      >
                        <span style={{ ...mono, fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-ink)" }}>
                          {isWeb ? `w${s.citation_id?.split(":")[1]}` : s.article_id}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium" style={{ color: "var(--color-ink)", fontFamily: "var(--font-body)" }}>
                            {s.title ? decodeEntities(s.title) : s.url}
                          </span>
                          <span style={{ ...mono, fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
                            {isWeb ? (
                              <span style={{ color: "var(--color-muted)", fontWeight: 600 }}>LIVE WEB</span>
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
              {m.role === "assistant" && m.content && (
                <div
                  className="mt-2 flex items-center justify-end"
                  style={{ borderTop: "1px solid var(--color-rule)", paddingTop: "4px" }}
                >
                  <button
                    type="button"
                    onClick={() => (playingIndex === i ? stopSpeaking() : speakMessage(i, m.content))}
                    className="cursor-pointer inline-flex items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    style={{
                      ...mono,
                      fontSize: "var(--text-xs)",
                      fontWeight: 500,
                      letterSpacing: "0.06em",
                      color: playingIndex === i ? "var(--bias-left)" : "var(--color-muted)",
                      borderRadius: "var(--radius-input)",
                      padding: "var(--space-2xs) var(--space-xs)",
                    }}
                    aria-label={playingIndex === i ? "Stop reading message aloud" : "Read message aloud"}
                  >
                    {playingIndex === i ? (
                      <>
                        <span
                          className="inline-block h-2 w-2 rounded-full animate-pulse"
                          style={{ background: "var(--bias-left)" }}
                        />
                        <span>STOP</span>
                      </>
                    ) : (
                      <>
                        <svg
                          className="h-3 w-3 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                        </svg>
                        <span>READ ALOUD</span>
                      </>
                    )}
                  </button>
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
              style={{ borderColor: "var(--color-rule)", color: "var(--color-ink-2)", background: "var(--color-paper)", borderRadius: "var(--radius-input)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)" }}
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
            placeholder={
              voiceState === "listening"
                ? isSpeaking
                  ? "Recording your voice…"
                  : "Listening for your voice (speak now)…"
                : voiceState === "transcribing"
                  ? "Transcribing your question…"
                  : storyId
                    ? "Ask about this story…"
                    : "Ask across all stories…"
            }
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 disabled:opacity-40"
            style={{
              borderColor: "var(--color-rule)",
              background: "var(--color-paper)",
              color: "var(--color-ink)",
              borderRadius: "var(--radius-input)",
              fontSize: "var(--text-sm)",
              fontFamily: "var(--font-body)",
              padding: "var(--space-sm) var(--space-md)",
            }}
          />
          <button
            type="button"
            onClick={voiceState === "idle" ? startVoice : cancelVoice}
            disabled={voiceState === "idle" && busy}
            aria-label={
              voiceState === "idle" ? "Record a voice question" : voiceState === "listening" ? "Stop recording" : "Cancel"
            }
            className="shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              borderRadius: "var(--radius-input)",
              padding: "var(--space-sm) var(--space-md)",
              fontSize: "var(--text-sm)",
              fontFamily: "var(--font-body)",
              fontWeight: 500,
              ...(voiceState === "idle"
                ? { borderColor: "var(--color-rule)", background: "var(--color-paper)", color: "var(--color-ink)" }
                : { borderColor: "transparent", background: "var(--color-ink)", color: "var(--color-paper)" }),
            }}
          >
            {voiceState === "listening" && (
              isSpeaking ? (
                <span className="inline-flex items-center gap-1.5" style={{ ...mono, letterSpacing: "0.04em", color: "var(--bias-right)" }}>
                  <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--bias-right)" }} />
                  <span>● REC</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 opacity-90" style={{ ...mono, letterSpacing: "0.04em" }}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full animate-ping" style={{ background: "var(--color-paper)" }} />
                  <span>LISTENING…</span>
                </span>
              )
            )}
            {voiceState === "transcribing" && (
              <span className="loading-spinner cn-anim" style={{ width: 14, height: 14 }} />
            )}
            {voiceState === "idle" && "Mic"}
          </button>
          <span role="status" aria-live="polite" className="sr-only">
            {voiceState === "listening"
              ? "Listening for your question."
              : voiceState === "transcribing"
                ? "Transcribing your question."
                : ""}
          </span>
          <button
            type={busy ? "button" : "submit"}
            onClick={busy ? stop : undefined}
            disabled={!busy && (voiceState !== "idle" || !input.trim())}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
            style={{
              background: "var(--color-ink)",
              color: "var(--color-paper)",
              borderRadius: "var(--radius-input)",
              padding: "var(--space-sm) var(--space-lg)",
              fontSize: "var(--text-sm)",
              fontFamily: "var(--font-body)",
              fontWeight: 500,
              boxShadow: "inset 0 1px 0 var(--glint), 0 0 0 1px var(--color-rule), 0 3px 0 var(--color-rule)",
            }}
          >
            {busy ? "Stop" : "Send"}
          </button>
        </form>
        {voiceError && (
          <p role="status" aria-live="polite" className="text-xs" style={{ color: "var(--bias-right)" }}>
            {voiceError}
          </p>
        )}
      </div>
    </div>
  );
}

export default withErrorBoundary(ChatPanel, "ChatPanel");