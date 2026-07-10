import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { fetchCountries } from "../api";

const mono = { fontFamily: "var(--font-mono)" } as const;

/** Multi-select country picker. Backed by /api/countries so the list is
    never hardcoded - every country GDELT can be polled for is selectable,
    and ones with no data yet are labeled rather than hidden (see
    pipeline/gdelt_doc.py: coverage only exists once a user picks it). */
export default function CountrySelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
}) {
  const { data: countries } = useQuery({ queryKey: ["countries"], queryFn: fetchCountries });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const byCode = new Map((countries ?? []).map((c) => [c.code, c]));
  const matches = (countries ?? [])
    .filter((c) => !value.includes(c.code))
    .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  function toggle(code: string) {
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative">
      {value.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {value.map((code) => (
            <span
              key={code}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm"
              style={{ background: "var(--chip-center-bg)", color: "var(--chip-center-ink)" }}
            >
              {byCode.get(code)?.name ?? code}
              <button type="button" onClick={() => toggle(code)} className="cursor-pointer">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search for a country…"
        className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
        style={{ border: "1px solid var(--input-border)", background: "var(--surface-1)", color: "var(--ink)" }}
      />
      {open && matches.length > 0 && (
        <div
          className="absolute z-10 mt-1.5 max-h-64 w-full overflow-y-auto rounded-lg shadow-lg"
          style={{ border: "1px solid var(--input-border)", background: "var(--surface-1)" }}
        >
          {matches.map((c) => {
            const hasData = c.source_article_count > 0 || c.story_count > 0;
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => toggle(c.code)}
                className="flex w-full cursor-pointer items-center justify-between px-3.5 py-2 text-left text-sm hover:bg-black/[0.03]"
                style={{ color: "var(--ink)" }}
              >
                <span>{c.name}</span>
                {!hasData && (
                  <span style={{ ...mono, fontSize: 9.5, letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
                    NO DATA YET
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
