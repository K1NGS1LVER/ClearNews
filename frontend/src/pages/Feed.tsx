import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { decodeEntities, fetchCountries, fetchStories } from "../api";
import Loading from "../components/Loading";
import Sparkline from "../components/Sparkline";
import { LeanBar, MetaLine, Thumb } from "../components/StoryBits";
import FilterBar, { CountryEmptyState } from "../components/FilterBar";
import { DEFAULT_FILTERS, type Filters } from "../lib/filters";

const PAGE_SIZE = 60;

export default function Feed() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const { data: countries } = useQuery({ queryKey: ["countries"], queryFn: fetchCountries });
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["stories", filters],
    queryFn: ({ pageParam }) =>
      fetchStories({
        status: filters.status ?? undefined,
        source_country: filters.mode === "source" ? (filters.country ?? undefined) : undefined,
        about_country: filters.mode === "about" ? (filters.country ?? undefined) : undefined,
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE ? allPages.flat().length : undefined,
  });

  const stories = data?.pages.flat() ?? [];

  if (isLoading) return <Loading label="Loading stories…" />;
  if (error) return <p className="p-8 text-red-700">Failed to load stories.</p>;

  const liveCount = stories.filter((s) => s.status !== "dead").length;
  const selectedCountry = countries?.find((c) => c.code === filters.country);
  const showEmptyState =
    filters.country &&
    stories?.length === 0 &&
    selectedCountry &&
    selectedCountry.source_article_count === 0 &&
    selectedCountry.story_count === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-8 pt-2 sm:px-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 15, fontWeight: 600, color: "var(--ink-2)" }}>
          Tracking {liveCount} live stories
        </h1>
      </div>

      <FilterBar filters={filters} onChange={setFilters} showStatus />

      {showEmptyState && selectedCountry ? (
        <CountryEmptyState countryName={selectedCountry.name} />
      ) : (
        <div className="flex flex-col gap-3 sm:gap-0 sm:overflow-hidden sm:rounded-[10px] sm:border sm:border-[color:var(--border)]">
          {stories?.map((s) => (
            <Link
              key={s.id}
              to={`/story/${s.id}`}
              className="flex flex-col overflow-hidden rounded-xl border border-[color:var(--border)] bg-[var(--surface-1)] shadow-[0_1px_3px_var(--card-shadow)] transition-colors hover:bg-black/[0.02] sm:flex-row sm:items-center sm:gap-[18px] sm:rounded-none sm:border-0 sm:border-t sm:border-t-[color:var(--rowline)] sm:bg-transparent sm:shadow-none sm:first:border-t-0"
            >
              <Thumb src={s.image_url} title={decodeEntities(s.title)} dead={s.status === "dead"} />
              <div className="min-w-0 flex-1 flex flex-col gap-1.5 p-3.5 sm:p-0 sm:py-3.5 sm:pr-5">
                <MetaLine s={s} />
                <h2
                  className="line-clamp-2"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: 18,
                    fontWeight: 600,
                    lineHeight: 1.25,
                    color: s.status === "dead" ? "var(--status-dead)" : "var(--ink)",
                  }}
                >
                  {decodeEntities(s.title)}
                </h2>
                <div style={{ opacity: s.status === "dead" ? 0.7 : 1 }}>
                  <LeanBar left={s.bias_left_share} center={s.bias_center_share} right={s.bias_right_share} />
                </div>
              </div>
              <div className="hidden shrink-0 sm:my-3.5 sm:mr-5 sm:block" style={{ opacity: s.status === "dead" ? 0.5 : 1 }}>
                <Sparkline counts={s.daily_counts} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {hasNextPage && !showEmptyState && (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-4 w-full cursor-pointer rounded-lg py-2.5 text-sm disabled:cursor-default disabled:opacity-60"
          style={{ border: "1px solid var(--input-border)", background: "var(--surface-1)", color: "var(--ink-2)" }}
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
