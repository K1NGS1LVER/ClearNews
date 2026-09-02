import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { decodeEntities, fetchArticle, type ArticleDetail } from "../api";
import BiasChip from "../components/BiasChip";
import Loading from "../components/Loading";
import StoryAsk from "../components/StoryAsk";

const mono = { fontFamily: "var(--font-mono)" } as const;
const serif = { fontFamily: "var(--font-serif)" } as const;


export default function Article() {
  const id = Number(useParams().id);
  const { data: a, isLoading } = useQuery<ArticleDetail>({
    queryKey: ["article", id],
    queryFn: () => fetchArticle(id),
  });

  if (isLoading)
    return <Loading label="Fetching article…" />;
  if (!a) return <p className="p-8" style={{ color: "var(--ink-muted)" }}>Article not found.</p>;

  const content = (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-2 sm:px-8">
      {a.story_id && (
        <Link
          to={`/story/${a.story_id}`}
          className="mb-4 flex items-center gap-2"
          style={{ ...mono, fontSize: 11, color: "var(--ink-muted)" }}
        >
          <span>← STORY:</span>
          <span className="truncate underline underline-offset-[3px]" style={{ color: "var(--ink-2)" }}>
            {decodeEntities(a.story_title ?? "Back to story").toUpperCase()}
          </span>
        </Link>
      )}
      <article className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2.5" style={{ ...mono, fontSize: "10.5px", letterSpacing: "0.05em", color: "var(--ink-muted)" }}>
            {a.bias_label && (
              <BiasChip label={a.bias_label} confidence={a.bias_confidence} />
            )}
            <span>{a.outlet.toUpperCase()}</span>
            <span>·</span>
            <span>{a.published_at}</span>
            {a.sentiment !== null && (
              <>
                <span>·</span>
                <span style={{ color: a.sentiment > 0 ? "var(--status-active)" : a.sentiment < 0 ? "var(--bias-right)" : "var(--ink-muted)" }}>
                  SENTIMENT {a.sentiment > 0 ? "+" : ""}{a.sentiment.toFixed(2)}
                </span>
              </>
            )}
          </div>
          <h1 style={{ ...serif, fontSize: 27, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.01em", color: "var(--ink)" }}>
            {a.title ? decodeEntities(a.title) : "(untitled)"}
          </h1>
        </div>

        {a.content ? (
          <div className="flex flex-col gap-3.5" style={{ ...serif, fontSize: 16, lineHeight: 1.7, color: "var(--ink)" }}>
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
          className="mt-2 inline-block w-fit underline underline-offset-[3px] hover:opacity-80"
          style={{ ...mono, fontSize: 11, color: "var(--ink-2)" }}
        >
          READ ORIGINAL AT {a.outlet.toUpperCase()} ↗
        </a>
      </article>
    </div>
  );

  return a.story_id ? <StoryAsk storyId={a.story_id}>{content}</StoryAsk> : content;
}
