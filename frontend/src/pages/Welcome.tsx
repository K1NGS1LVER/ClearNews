import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CATEGORIES, type BiasPref, type Category, putPreferences } from "../api";
import { useMe } from "../auth";
import CountrySelect from "../components/CountrySelect";

const mono = { fontFamily: "var(--font-mono)" } as const;
const serif = { fontFamily: "var(--font-serif)" } as const;

const categoryLabels: Record<Category, string> = {
  politics: "Politics",
  conflict: "Conflict",
  disaster: "Disaster",
  crime: "Crime",
  health: "Health",
  economy: "Economy",
  sports: "Sports",
  science_tech: "Science & Tech",
  culture: "Culture",
};

const biasOptions: { value: BiasPref; label: string; description: string }[] = [
  { value: "balanced", label: "BALANCED", description: "Prioritize stories with an even left/center/right split." },
  { value: "everything", label: "EVERYTHING", description: "No lean-based ranking — just relevance and recency." },
  { value: "challenge", label: "CHALLENGE ME", description: "Surface stories with the most contested, polarized coverage." },
];

export default function Welcome() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState(me?.display_name ?? "");
  const [categories, setCategories] = useState<Category[]>(me?.categories ?? []);
  const [favourite, setFavourite] = useState<Category | null>(me?.favourite_category ?? null);
  const [biasPref, setBiasPref] = useState<BiasPref>(me?.bias_pref ?? "balanced");
  const [countries, setCountries] = useState<string[]>(me?.countries ?? []);
  const [keywords, setKeywords] = useState<string[]>(me?.keywords ?? []);
  const [keywordInput, setKeywordInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleCategory(cat: Category) {
    setCategories((prev) => {
      if (prev.includes(cat)) {
        if (favourite === cat) setFavourite(null);
        return prev.filter((c) => c !== cat);
      }
      return [...prev, cat];
    });
  }

  function toggleFavourite(cat: Category) {
    if (!categories.includes(cat)) return;
    setFavourite((prev) => (prev === cat ? null : cat));
  }

  function addKeyword(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw) && keywords.length < 20) {
      setKeywords((prev) => [...prev, kw]);
    }
    setKeywordInput("");
  }

  async function save(skip = false) {
    setPending(true);
    setError(null);
    try {
      await putPreferences({
        display_name: displayName || undefined,
        favourite_category: skip ? null : favourite,
        categories: skip ? [] : categories,
        bias_pref: skip ? "balanced" : biasPref,
        keywords: skip ? [] : keywords,
        countries: skip ? [] : countries,
      });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/foryou");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save preferences");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-6 sm:px-8">
      <h1 style={{ ...serif, fontSize: 30, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--ink)" }}>
        Tell us what you follow
      </h1>
      <p className="mt-1.5" style={{ fontSize: 14, color: "var(--ink-muted)" }}>
        This shapes your For You feed. You can change it anytime.
      </p>

      <label className="mt-8 flex flex-col gap-1.5">
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>DISPLAY NAME</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="max-w-xs rounded-lg px-3.5 py-2.5 text-sm outline-none"
          style={{ border: "1px solid var(--input-border)", background: "var(--surface-1)", color: "var(--ink)" }}
        />
      </label>

      <div className="mt-8">
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>
          CATEGORIES · TAP ★ TO SET YOUR FAVOURITE
        </span>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const active = categories.includes(cat);
            return (
              <div
                key={cat}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
                style={{
                  border: `1px solid ${active ? "var(--ink)" : "var(--input-border)"}`,
                  background: active ? "var(--navpill)" : "var(--surface-1)",
                  color: active ? "var(--navpill-ink)" : "var(--ink)",
                }}
              >
                <button type="button" onClick={() => toggleCategory(cat)} className="cursor-pointer">
                  {categoryLabels[cat]}
                </button>
                {active && (
                  <button
                    type="button"
                    onClick={() => toggleFavourite(cat)}
                    className="cursor-pointer"
                    title="Set as favourite"
                    style={{ color: favourite === cat ? "var(--status-fading)" : "inherit", opacity: favourite === cat ? 1 : 0.5 }}
                  >
                    ★
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8">
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>
          COUNTRIES TO FOLLOW
        </span>
        <div className="mt-2.5">
          <CountrySelect value={countries} onChange={setCountries} />
        </div>
      </div>

      <div className="mt-8">
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>HOW MUCH LEAN DO YOU WANT TO SEE</span>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
          {biasOptions.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => setBiasPref(opt.value)}
              className="cursor-pointer rounded-lg p-3.5 text-left"
              style={{
                border: `1.5px solid ${biasPref === opt.value ? "var(--ink)" : "var(--input-border)"}`,
                background: "var(--surface-1)",
              }}
            >
              <div style={{ ...mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "var(--ink)" }}>{opt.label}</div>
              <div className="mt-1" style={{ fontSize: 12.5, lineHeight: 1.4, color: "var(--ink-muted)" }}>{opt.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <span style={{ ...mono, fontSize: 10.5, letterSpacing: "0.08em", color: "var(--ink-muted)" }}>
          KEYWORDS TO FOLLOW · PRESS ENTER TO ADD
        </span>
        <input
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          onKeyDown={addKeyword}
          placeholder="e.g. artificial intelligence, climate"
          className="mt-2.5 w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
          style={{ border: "1px solid var(--input-border)", background: "var(--surface-1)", color: "var(--ink)" }}
        />
        {keywords.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1 text-sm"
                style={{ background: "var(--chip-center-bg)", color: "var(--chip-center-ink)" }}
              >
                {kw}
                <button
                  type="button"
                  onClick={() => setKeywords((prev) => prev.filter((k) => k !== kw))}
                  className="cursor-pointer"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-5 text-sm" style={{ color: "var(--bias-right)" }}>
          {error}
        </p>
      )}

      <div className="mt-9 flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => save(false)}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
          style={{ background: "var(--navpill)", color: "var(--navpill-ink)" }}
        >
          {pending ? "Saving…" : "Save & continue"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => save(true)}
          className="text-sm font-medium underline"
          style={{ color: "var(--ink-muted)" }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
