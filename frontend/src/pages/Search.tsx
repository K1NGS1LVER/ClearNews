import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { decodeEntities, fetchSearch } from "../api";

const mono = { fontFamily: "var(--font-mono)" } as const;

const chip = (label: string | null) => ({
  background: label === "left" ? "var(--bias-left)" : label === "right" ? "var(--bias-right)" : "var(--chip-center-bg)",
  color: label === "center" || !label ? "var(--chip-center-ink)" : "#fff",
});

export default function Search() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["search", query],
    queryFn: () => fetchSearch(query),
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
          {data.length} MATCH{data.length === 1 ? "" : "ES"}
        </span>
      )}
      {data && data.length === 0 && (
        <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>No matches.</p>
      )}
      <ul className="flex flex-col">
        {data?.map((a, i) => (
          <li
            key={a.id}
            className="flex flex-col gap-1.5 py-3.5"
            style={{ borderTop: "1px solid var(--rowline)", marginTop: i === 0 ? 12 : 0 }}
          >
            <Link to={`/article/${a.id}`} className="text-[14.5px] font-medium hover:underline" style={{ color: "var(--ink)" }}>
              {a.title ? decodeEntities(a.title) : a.url}
            </Link>
            <div className="flex flex-wrap items-center gap-2 pl-0" style={{ ...mono, fontSize: 10, color: "var(--ink-muted)" }}>
              <span>{a.outlet} · {a.published_at}</span>
              {a.bias_label && (
                <>
                  <span>·</span>
                  <span className="rounded px-2 py-0.5 text-[9px] font-semibold uppercase" style={{ letterSpacing: "0.08em", ...chip(a.bias_label) }}>
                    {a.bias_label}
                  </span>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
