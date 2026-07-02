import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { ArticleOut } from "../api";

type ArticleDetail = ArticleOut & {
  content: string | null;
  story_id: number | null;
  story_title: string | null;
};

const chipStyle = (label: string | null) => ({
  background:
    label === "left" ? "var(--bias-left)" : label === "right" ? "var(--bias-right)" : "var(--bias-center)",
  color: label === "center" || !label ? "var(--ink-2)" : "#fff",
});

export default function Article() {
  const id = Number(useParams().id);
  const { data: a, isLoading } = useQuery<ArticleDetail>({
    queryKey: ["article", id],
    queryFn: () => fetch(`/api/articles/${id}`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }),
  });

  if (isLoading)
    return <p className="p-8" style={{ color: "var(--ink-muted)" }}>Fetching article…</p>;
  if (!a) return <p className="p-8" style={{ color: "var(--ink-muted)" }}>Article not found.</p>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {a.story_id && (
        <Link to={`/story/${a.story_id}`} className="text-sm" style={{ color: "var(--ink-muted)" }}>
          ← {a.story_title ?? "Back to story"}
        </Link>
      )}
      <article
        className="mt-3 rounded-lg border p-6"
        style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--ink-2)" }}>
          {a.bias_label && (
            <span className="rounded px-1.5 py-0.5 font-semibold uppercase" style={chipStyle(a.bias_label)}>
              leans {a.bias_label}
            </span>
          )}
          <span>{a.outlet}</span>
          <span>· {a.published_at}</span>
          {a.sentiment !== null && <span>· sentiment {a.sentiment.toFixed(2)}</span>}
        </div>
        <h1 className="mb-4 text-2xl font-bold leading-tight">{a.title ?? "(untitled)"}</h1>

        {a.content ? (
          <div className="flex flex-col gap-3 text-[15px] leading-relaxed">
            {a.content.split(/\n+/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
            Full text could not be extracted from this site.
          </p>
        )}

        <a
          href={a.url}
          target="_blank"
          rel="noreferrer"
          className="mt-6 inline-block text-sm font-medium hover:underline"
          style={{ color: "var(--bias-left)" }}
        >
          Read original at {a.outlet} ↗
        </a>
      </article>
    </div>
  );
}
