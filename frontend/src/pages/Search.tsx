import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchSearch } from "../api";

export default function Search() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["search", query],
    queryFn: () => fetchSearch(query),
    enabled: query.length > 0,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search by meaning, e.g. 'diplomatic talks that eased oil prices'…"
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
        />
        <button
          type="submit"
          disabled={!input.trim() || isFetching}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: "var(--bias-left)" }}
        >
          {isFetching ? "Searching…" : "Search"}
        </button>
      </form>

      {data && data.length === 0 && (
        <p className="text-sm" style={{ color: "var(--ink-muted)" }}>No matches.</p>
      )}
      <ul className="flex flex-col gap-2">
        {data?.map((a) => (
          <li
            key={a.id}
            className="rounded-lg border p-3"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <a href={a.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline">
              {a.title ?? a.url}
            </a>
            <div className="mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
              {a.outlet} · {a.published_at}
              {a.bias_label && <> · leans {a.bias_label}</>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
