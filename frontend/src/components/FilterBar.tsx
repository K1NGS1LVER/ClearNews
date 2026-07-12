import { useQuery } from "@tanstack/react-query";
import { fetchCountries } from "../api";
import type { Filters } from "../lib/filters";
import { withErrorBoundary } from "./ErrorBoundary";

const mono = { fontFamily: "var(--font-mono)" } as const;

function pillGroup<T extends string | null>(
  options: readonly { value: T; label: string }[],
  active: T,
  onSelect: (v: T) => void,
) {
  return (
    <div className="flex overflow-hidden rounded-lg" style={{ border: "1px solid var(--input-border)" }}>
      {options.map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onSelect(opt.value)}
          className="cursor-pointer px-3 py-1.5 text-sm"
          style={{
            background: active === opt.value ? "var(--navpill)" : "var(--surface-1)",
            color: active === opt.value ? "var(--navpill-ink)" : "var(--ink)",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function FilterBar({
  filters,
  onChange,
  showStatus = false,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  showStatus?: boolean;
}) {
  const { data: countries } = useQuery({ queryKey: ["countries"], queryFn: fetchCountries });

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <select
        value={filters.country ?? ""}
        onChange={(e) => onChange({ ...filters, country: e.target.value || null })}
        className="cursor-pointer rounded-lg px-3 py-1.5 text-sm outline-none"
        style={{ border: "1px solid var(--input-border)", background: "var(--surface-1)", color: "var(--ink)" }}
      >
        <option value="">All countries</option>
        {(countries ?? []).map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
            {c.source_article_count === 0 && c.story_count === 0 ? " (no data yet)" : ""}
          </option>
        ))}
      </select>

      {filters.country &&
        pillGroup(
          [
            { value: "source" as const, label: "From this country" },
            { value: "about" as const, label: "About this country" },
          ],
          filters.mode,
          (mode) => onChange({ ...filters, mode }),
        )}

      {showStatus &&
        pillGroup(
          [
            { value: null, label: "All" },
            { value: "active", label: "Active" },
            { value: "fading", label: "Fading" },
            { value: "dead", label: "Dead" },
          ],
          filters.status,
          (status) => onChange({ ...filters, status }),
        )}
    </div>
  );
}

function CountryEmptyStateComponent({ countryName }: { countryName: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl py-16 text-center" style={{ border: "1px dashed var(--input-border)" }}>
      <span style={{ ...mono, fontSize: 11, letterSpacing: "0.06em", color: "var(--ink-muted)" }}>
        BUILDING COVERAGE FOR {countryName.toUpperCase()}
      </span>
      <span className="text-sm" style={{ color: "var(--ink-muted)" }}>
        First stories typically appear within an hour or two.
      </span>
    </div>
  );
}

export const CountryEmptyState = withErrorBoundary(CountryEmptyStateComponent, "CountryEmptyState");
export default withErrorBoundary(FilterBar, "FilterBar");
