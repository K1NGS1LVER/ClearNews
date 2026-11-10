import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CATEGORIES, type BiasPref, type Category, putPreferences } from "../api";
import { useMe } from "../auth";
import CountrySelect from "../components/CountrySelect";

const mono = { fontFamily: "var(--font-outlier)" } as const;
const display = { fontFamily: "var(--font-display)" } as const;

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

const focusStyle = {
  outline: "2px solid var(--color-focus)",
  outlineOffset: "2px",
} as const;

const pressSpringStyle = {
  transform: "translateY(3px)",
  transition: "transform var(--dur-micro) var(--ease-out)",
} as const;

const pressSpringMicroStyle = {
  transform: "translateY(2px)",
  transition: "transform var(--dur-micro) var(--ease-out)",
} as const;

function InputLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
      <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)" }}>{children}</span>
    </label>
  );
}

function InputField({ value, onChange, placeholder, maxWidth, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { maxWidth?: string }) {
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        maxWidth,
        background: "var(--color-paper)",
        border: "1.5px solid var(--color-rule)",
        borderRadius: "var(--radius-input)",
        fontSize: "var(--text-sm)",
        fontFamily: "var(--font-body)",
        color: "var(--color-ink)",
        padding: "var(--space-sm) var(--space-md)",
        ...props,
      }}
      onFocus={(e) => { Object.assign(e.currentTarget.style, focusStyle); e.currentTarget.style.borderColor = "var(--color-ink)"; }}
      onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; e.currentTarget.style.borderColor = "var(--color-rule)"; }}
    />
  );
}

function PrimaryButton({ children, onClick, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...mono,
        fontSize: "var(--text-sm)",
        fontWeight: 500,
        padding: "var(--space-sm) var(--space-xl)",
        borderRadius: "var(--radius-input)",
        background: "var(--color-ink)",
        color: "var(--color-paper)",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "transform var(--dur-micro) var(--ease-out), box-shadow var(--dur-micro) var(--ease-out)",
        boxShadow: "inset 0 1px 0 var(--glint), 0 0 0 1px var(--color-rule), 0 3px 0 var(--color-rule)",
        ...props,
      }}
      onMouseDown={(e) => { if (!disabled) Object.assign(e.currentTarget.style, pressSpringStyle); }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
      onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...mono,
        fontSize: "var(--text-sm)",
        fontWeight: 500,
        color: "var(--color-muted)",
        background: "transparent",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        textDecoration: "underline",
        textDecorationStyle: "dotted",
        opacity: disabled ? 0.4 : 1,
        transition: "color var(--dur-micro) var(--ease-out)",
        ...props,
      }}
      onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
      onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
    >
      {children}
    </button>
  );
}

function ChipButton({ active, onClick, children, dotColor, dotActive }: { active: boolean; onClick: () => void; children: React.ReactNode; dotColor?: string; dotActive?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-sm)",
        padding: "var(--space-xs) var(--space-md)",
        borderRadius: "var(--radius-input)",
        border: `1.5px solid ${active ? "var(--color-ink)" : "var(--color-rule)"}`,
        background: active ? "var(--color-ink)" : "var(--color-paper)",
        color: active ? "var(--color-paper)" : "var(--color-ink)",
        cursor: "pointer",
        transition: "transform var(--dur-micro) var(--ease-out), background var(--dur-micro) var(--ease-out), border-color var(--dur-micro) var(--ease-out)",
      }}
      onMouseDown={(e) => Object.assign(e.currentTarget.style, pressSpringMicroStyle)}
      onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
      onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
    >
      {children}
      {dotActive && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: dotColor ?? "var(--status-fading)", flexShrink: 0 }} />}
    </button>
  );
}

function OptionCard({ active, onClick, title, description }: { active: boolean; onClick: () => void; title: string; description: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-xs)",
        padding: "var(--space-md)",
        borderRadius: "var(--radius-input)",
        border: `1.5px solid ${active ? "var(--color-ink)" : "var(--color-rule)"}`,
        background: "var(--color-paper)",
        cursor: "pointer",
        textAlign: "left",
        transition: "transform var(--dur-micro) var(--ease-out), border-color var(--dur-micro) var(--ease-out), box-shadow var(--dur-micro) var(--ease-out)",
      }}
      onMouseDown={(e) => Object.assign(e.currentTarget.style, pressSpringMicroStyle)}
      onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
      onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
    >
      <div style={{ ...mono, fontSize: "var(--text-xs)", fontWeight: 600, letterSpacing: "0.06em", color: "var(--color-ink)" }}>{title}</div>
      <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.4, color: "var(--color-muted)" }}>{description}</div>
    </button>
  );
}

function KeywordChip({ children, onRemove }: { children: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-sm)",
        padding: "var(--space-xs) var(--space-md)",
        fontSize: "var(--text-sm)",
        background: "var(--chip-center-bg)",
        color: "var(--chip-center-ink)",
        borderRadius: "var(--radius-input)",
      }}
    >
      {children}
      <button
        type="button"
        onClick={onRemove}
        style={{
          ...mono,
          fontSize: "var(--text-sm)",
          lineHeight: 1,
          color: "inherit",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
          opacity: 0.6,
        }}
        onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
        onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
      >
        ×
      </button>
    </span>
  );
}

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
    <div style={{ minHeight: "100vh", background: "var(--color-paper)", color: "var(--color-ink)" }}>
      <section style={{ paddingTop: "var(--space-xl)", paddingBottom: "var(--space-lg)" }}>
        <div className="container" style={{ maxWidth: "720px" }}>
          <h1 style={{ ...display, fontSize: "var(--text-section)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--color-ink)", marginBottom: "var(--space-md)" }}>
            Tell us what you follow
          </h1>
          <p style={{ fontSize: "var(--text-base)", color: "var(--color-muted)", marginBottom: "var(--space-xl)" }}>
            This shapes your For You feed. You can change it anytime.
          </p>

          <form onSubmit={(e) => { e.preventDefault(); save(false); }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
              <InputLabel>
                DISPLAY NAME
                <InputField value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxWidth="320px" />
              </InputLabel>

              <div>
                <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)", display: "block", marginBottom: "var(--space-md)" }}>
                  CATEGORIES · TAP ★ TO SET YOUR FAVOURITE
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)" }}>
                  {CATEGORIES.map((cat) => {
                    const active = categories.includes(cat);
                    return (
                      <ChipButton
                        key={cat}
                        active={active}
                        onClick={() => toggleCategory(cat)}
                        dotColor="var(--status-fading)"
                        dotActive={favourite === cat}
                      >
                        {categoryLabels[cat]}
                      </ChipButton>
                    );
                  })}
                </div>
              </div>

              <div>
                <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)", display: "block", marginBottom: "var(--space-md)" }}>
                  COUNTRIES TO FOLLOW
                </span>
                <CountrySelect value={countries} onChange={setCountries} />
              </div>

              <div>
                <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)", display: "block", marginBottom: "var(--space-md)" }}>
                  HOW MUCH LEAN DO YOU WANT TO SEE
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-md)" }}>
                  {biasOptions.map((opt) => (
                    <OptionCard
                      key={opt.value}
                      active={biasPref === opt.value}
                      onClick={() => setBiasPref(opt.value)}
                      title={opt.label}
                      description={opt.description}
                    />
                  ))}
                </div>
              </div>

              <div>
                <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.08em", color: "var(--color-muted)", display: "block", marginBottom: "var(--space-md)" }}>
                  KEYWORDS TO FOLLOW · PRESS ENTER TO ADD
                </span>
                <InputField
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={addKeyword}
                  placeholder="e.g. artificial intelligence, climate"
                />
                {keywords.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)", marginTop: "var(--space-md)" }}>
                    {keywords.map((kw) => (
                      <KeywordChip key={kw} onRemove={() => setKeywords((prev) => prev.filter((k) => k !== kw))}>
                        {kw}
                      </KeywordChip>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <p style={{ fontSize: "var(--text-sm)", color: "var(--bias-right)" }}>
                  {error}
                </p>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginTop: "var(--space-lg)" }}>
                <PrimaryButton disabled={pending} onClick={() => save(false)}>
                  {pending ? "Saving…" : "SAVE & CONTINUE"}
                </PrimaryButton>
                <SecondaryButton disabled={pending} onClick={() => save(true)}>
                  Skip for now
                </SecondaryButton>
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}