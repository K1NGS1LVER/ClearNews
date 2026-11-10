import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { decodeEntities, fetchArticle, type ArticleDetail } from "../api";
import BiasChip from "../components/BiasChip";
import Loading from "../components/Loading";
import StoryAsk from "../components/StoryAsk";

const mono = { fontFamily: "var(--font-outlier)" } as const;
const body = { fontFamily: "var(--font-body)" } as const;
const display = { fontFamily: "var(--font-display)" } as const;

const focusStyle = {
  outline: "2px solid var(--color-focus)",
  outlineOffset: "2px",
} as const;

export default function Article() {
  const id = Number(useParams().id);
  const { data: a, isLoading } = useQuery<ArticleDetail>({
    queryKey: ["article", id],
    queryFn: () => fetchArticle(id),
  });

  if (isLoading)
    return <Loading label="Fetching article…" />;
  if (!a) return <p style={{ padding: "var(--space-xl)", color: "var(--color-muted)" }}>Article not found.</p>;

  const content = (
    <div className="container" style={{ maxWidth: "720px" }}>
      {a.story_id && (
        <Link
          to={`/story/${a.story_id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-sm)",
            marginBottom: "var(--space-lg)",
            ...mono,
            fontSize: "var(--text-xs)",
            letterSpacing: "0.06em",
            color: "var(--color-muted)",
            textDecoration: "none",
            transition: "color var(--dur-micro) var(--ease-out)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-ink)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-muted)"; }}
          onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
          onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
        >
          <span>← STORY</span>
          <span style={{ textDecoration: "underline", textUnderlineOffset: "3px", color: "var(--color-ink-2)", textTransform: "uppercase" }}>
            {decodeEntities(a.story_title ?? "Back to story")}
          </span>
        </Link>
      )}
      <article style={{ display: "flex", flexDirection: "column", gap: "var(--space-xl)" }}>
        <header style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-md)", ...mono, fontSize: "var(--text-xs)", letterSpacing: "0.05em", color: "var(--color-muted)" }}>
            {a.bias_label && (
              <BiasChip label={a.bias_label} confidence={a.bias_confidence} />
            )}
            <span style={{ textTransform: "uppercase" }}>{a.outlet}</span>
            <span>·</span>
            <span>{a.published_at}</span>
            {a.sentiment !== null && (
              <>
                <span>·</span>
                <span style={{ color: a.sentiment > 0 ? "var(--status-active)" : a.sentiment < 0 ? "var(--bias-right)" : "var(--color-muted)" }}>
                  SENTIMENT {a.sentiment > 0 ? "+" : ""}{a.sentiment.toFixed(2)}
                </span>
              </>
            )}
          </div>
          <h1 style={{ ...display, fontSize: "var(--text-3xl)", fontWeight: 700, lineHeight: 1.15, letterSpacing: "-0.02em", color: "var(--color-ink)" }}>
            {a.title ? decodeEntities(a.title) : "(untitled)"}
          </h1>
        </header>

        {a.content ? (
          <div style={{ ...body, fontSize: "var(--text-lg)", lineHeight: 1.75, color: "var(--color-ink)" }}>
            {a.content.split(/\n+/).map((p, i) => (
              <p key={i} style={{ marginBottom: "var(--space-md)" }}>{p}</p>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: "var(--text-base)", color: "var(--color-muted)" }}>
            Full text could not be extracted from this site.
          </p>
        )}

        <footer style={{ paddingTop: "var(--space-xl)", borderTop: "1px solid var(--color-rule)" }}>
          <a
            href={a.url}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-xs)",
              ...mono,
              fontSize: "var(--text-xs)",
              letterSpacing: "0.06em",
              color: "var(--color-ink-2)",
              textDecoration: "none",
              textDecorationSkipInk: "none",
              borderBottom: "1px dotted currentColor",
              transition: "opacity var(--dur-micro) var(--ease-out)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.6"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
            onFocus={(e) => Object.assign(e.currentTarget.style, focusStyle)}
            onBlur={(e) => { e.currentTarget.style.outline = ""; e.currentTarget.style.outlineOffset = ""; }}
          >
            READ ORIGINAL AT {a.outlet.toUpperCase()} →
          </a>
        </footer>
      </article>
    </div>
  );

  return a.story_id ? <StoryAsk storyId={a.story_id}>{content}</StoryAsk> : content;
}