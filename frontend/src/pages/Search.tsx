import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { decodeEntities, searchStories } from "../api";

const mono = { fontFamily: "var(--font-mono)" } as const;
const serif = { fontFamily: "var(--font-serif)" } as const;

const chip = (label: string | null) => ({
  background: label === "left" ? "var(--bias-left)" : label === "right" ? "var(--bias-right)" : "var(--chip-center-bg)",
  color: label === "center" || !label ? "var(--chip-center-ink)" : "#fff",
});

const statusColor: Record<string, string> = {
  active: "var(--status-active)",
  fading: "var(--status-fading)",
  dead: "var(--status-dead)",
};

export default function Search() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["searchStories", query],
    queryFn: () => searchStories(query),
    enabled: query.length > 0,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-2 sm:px-8">
      <form
        className="mb-5 flex gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input);
        }}
      >
        <div
          className="flex flex-1 items-center gap-2.5 rounded-lg px-4 py-2.5"
          style={{ border: "1.5px solid var(--ink)", background: "var(--surface-1)" }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="diplomatic talks that eased oil prices…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--ink)" }}
          />
          <span className="hidden shrink-0 sm:inline" style={{ ...mono, fontSize: "9.5px", color: "var(--baseline)" }}>
            SEMANTIC · MEANING, NOT KEYWORDS
          </span>
        </div>
        <button
          type="submit"
          disabled={!input.trim() || isFetching}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
          style={{ background: "var(--ink)", color: "var(--surface-1)" }}
        >
          {isFetching ? "Searching…" : "Search"}
        </button>
      </form>

      {data && (
        <span style={{ ...mono, fontSize: "10.5px", letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
          {data.length} STORY MATCH{data.length === 1 ? "" : "ES"}
        </span>
      )}
      {data && data.length === 0 && (
        <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>No matches.</p>
      )}
      <div className="mt-3 flex flex-col gap-4">
        {data?.map((s) => (
          <section
            key={s.story_id}
            className="flex flex-col gap-2.5 rounded-[10px] border p-4"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                to={`/story/${s.story_id}`}
                className="text-[17px] font-semibold hover:underline"
                style={{ ...serif, color: "var(--ink)" }}
              >
                {decodeEntities(s.story_title)}
              </Link>
              <div className="flex items-center gap-2" style={{ ...mono, fontSize: "10.5px", letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
                <span className="h-[7px] w-[7px] rounded-full" style={{ background: statusColor[s.story_status] ?? "var(--ink-muted)" }} />
                <span style={{ color: statusColor[s.story_status] ?? "var(--ink-muted)", fontWeight: 600 }}>
                  {s.story_status.toUpperCase()}
                </span>
                <span>·</span>
                <span>{s.article_count} ARTICLES IN STORY</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t pt-2.5" style={{ borderColor: "var(--hair)" }}>
              <span style={{ ...mono, fontSize: 10, letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
                MATCHED ARTICLES ({s.matched_articles.length})
              </span>
              <ul className="flex flex-col gap-2">
                {s.matched_articles.slice(0, 3).map((a) => (
                  <li key={a.id} className="flex flex-col gap-1">
                    <Link
                      to={`/article/${a.id}`}
                      className="text-[13.5px] font-medium hover:underline"
                      style={{ color: "var(--ink)" }}
                    >
                      {a.title ? decodeEntities(a.title) : a.url}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2" style={{ ...mono, fontSize: 10, color: "var(--ink-muted)" }}>
                      <span>{a.outlet} · {a.published_at}</span>
                      {a.bias_label && (
                        <>
                          <span>·</span>
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase" style={{ letterSpacing: "0.08em", ...chip(a.bias_label) }}>
                            {a.bias_label}
                          </span>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
