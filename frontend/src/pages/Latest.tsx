import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ArticleOut } from "../api";

const chip = (label: string | null) => ({
  background:
    label === "left" ? "var(--bias-left)" : label === "right" ? "var(--bias-right)" : "var(--bias-center)",
  color: label === "center" || !label ? "var(--ink-2)" : "#fff",
});

/** Plain reading feed: newest articles, click a headline to read in-app. */
export default function Latest() {
  const { data: articles, isLoading } = useQuery<ArticleOut[]>({
    queryKey: ["latest"],
    queryFn: () => fetch("/api/articles?limit=100").then((r) => r.json()),
  });

  if (isLoading)
    return <p className="p-8" style={{ color: "var(--ink-muted)" }}>Loading latest news…</p>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex flex-col gap-2">
        {articles?.map((a) => (
          <Link
            key={a.id}
            to={`/article/${a.id}`}
            className="rounded-lg border p-3 transition-shadow hover:shadow-md"
            style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
          >
            <div className="mb-1 flex items-center gap-2 text-xs" style={{ color: "var(--ink-muted)" }}>
              {a.bias_label && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={chip(a.bias_label)}>
                  {a.bias_label}
                </span>
              )}
              <span className="truncate">{a.outlet}</span>
              <span className="shrink-0">· {a.published_at}</span>
            </div>
            <h2 className="font-medium leading-snug">{a.title}</h2>
          </Link>
        ))}
      </div>
    </div>
  );
}
