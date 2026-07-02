const base = "/api";

export type StoryCard = {
  id: number;
  title: string;
  status: "active" | "fading" | "dead";
  first_seen: string;
  last_seen: string;
  article_count: number;
  bias_left_share: number | null;
  bias_center_share: number | null;
  bias_right_share: number | null;
  daily_counts: number[];
};

export type DailyMetric = {
  day: string;
  article_count: number;
  unique_outlets: number;
  sentiment_mean: number | null;
  drift_score: number | null;
  bias_left_share: number | null;
  bias_center_share: number | null;
  bias_right_share: number | null;
};

export type ArticleOut = {
  id: number;
  url: string;
  title: string | null;
  outlet: string;
  published_at: string;
  sentiment: number | null;
  bias_label: "left" | "center" | "right" | null;
  bias_score: number | null;
};

export type StoryArc = {
  id: number;
  title: string;
  status: string;
  summary: string | null;
  metrics: DailyMetric[];
  articles: ArticleOut[];
};

export type OutletRow = {
  domain: string;
  article_count: number;
  sentiment_mean: number | null;
  bias_mean: number | null;
  outlet_overall_bias: number | null;
};

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(base + path);
  if (!resp.ok) throw new Error(`${resp.status} ${path}`);
  return resp.json();
}

export const fetchStories = () => get<StoryCard[]>("/stories");
export const fetchArc = (id: number) => get<StoryArc>(`/stories/${id}/arc`);
export const fetchOutlets = (id: number) =>
  get<OutletRow[]>(`/stories/${id}/outlets`);
export const fetchSearch = (q: string) =>
  get<ArticleOut[]>(`/search?q=${encodeURIComponent(q)}`);
