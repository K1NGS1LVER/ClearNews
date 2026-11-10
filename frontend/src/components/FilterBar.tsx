import { useQuery } from "@tanstack/react-query";
import { fetchCountries } from "../api";
import type { Filters } from "../lib/filters";
import { withErrorBoundary } from "./ErrorBoundary";

const mono = { fontFamily: "var(--font-outlier)" } as const;
const body = { fontFamily: "var(--font-body)" } as const;

function pillGroup<T extends string | null>(
  options: readonly { value: T; label: string }[],
  active: T,
  onSelect: (v: T) => void,
) {
  return (
    <div className="flex overflow-hidden" style={{ borderRadius: "var(--radius-input)", border: "1px solid var(--color-rule)" }}>
      {options.map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onSelect(opt.value)}
          className="cursor-pointer"
          style={{
            padding: "var(--space-xs) var(--space-md)",
            fontSize: "var(--text-sm)",
            fontFamily: "var(--font-body)",
            fontWeight: 500,
            background: active === opt.value ? "var(--color-ink)" : "var(--color-paper)",
            color: active === opt.value ? "var(--color-paper)" : "var(--color-ink)",
            border: "none",
            transition: "background var(--dur-micro) var(--ease-out), color var(--dur-micro) var(--ease-out)",
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(1px)"; }}
          onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
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
        className="cursor-pointer outline-none"
        style={{
          padding: "var(--space-xs) var(--space-md)",
          fontSize: "var(--text-sm)",
          fontFamily: "var(--font-body)",
          borderRadius: "var(--radius-input)",
          border: "1px solid var(--color-rule)",
          background: "var(--color-paper)",
          color: "var(--color-ink)",
          minWidth: 200,
        }}
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
    <div className="flex flex-col items-center gap-1.5" style={{ padding: "var(--space-3xl)", borderRadius: "var(--radius-card)", border: "1px dashed var(--color-rule)", textAlign: "center" }}>
      <span style={{ ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.06em", color: "var(--color-muted)", textTransform: "uppercase" }}>
        BUILDING COVERAGE FOR {countryName.toUpperCase()}
      </span>
      <span style={{ ...body, fontSize: "var(--text-sm)", color: "var(--color-ink-2)" }}>
        First stories typically appear within an hour or two.
      </span>
    </div>
  );
}

export const CountryEmptyState = withErrorBoundary(CountryEmptyStateComponent, "CountryEmptyState");
export default withErrorBoundary(FilterBar, "FilterBar");