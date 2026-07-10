const base = "/api";

/** Some scraped titles carry un-decoded HTML entities (e.g. "&#x2013;").
    A detached textarea decodes them without executing markup. */
const decoder = typeof document !== "undefined" ? document.createElement("textarea") : null;
export function decodeEntities(text: string): string {
  if (!decoder || !text.includes("&")) return text;
  decoder.innerHTML = text;
  return decoder.value;
}

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
  image_url: string | null;
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
  forecast: { day: string; predicted_count: number }[];
  articles: ArticleOut[];
};

export type OutletRow = {
  domain: string;
  article_count: number;
  sentiment_mean: number | null;
  bias_mean: number | null;
  outlet_overall_bias: number | null;
};

export type BiasLabel = "left" | "center" | "right";

export type ExplanationArticle = {
  id: number;
  title: string | null;
  outlet: string;
  bias_label: BiasLabel | null;
  explained: boolean;
  probs: Record<BiasLabel, number> | null;
  predicted: BiasLabel | null;
  tokens: string[] | null;
  values: [number, number, number][] | null;
};

export type TopWord = { word: string; value: number; articles: number };

export type ExplanationAggregate = {
  label_counts: Partial<Record<BiasLabel, number>>;
  probs: Record<BiasLabel, number>;
  top_words: Record<BiasLabel, TopWord[]>;
};

export type StoryExplanation = {
  status: "none" | "partial" | "complete";
  eligible: number;
  total: number;
  analyzed: number;
  as_of: string | null;
  stale: boolean;
  articles: ExplanationArticle[];
  aggregate: ExplanationAggregate | null;
};

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(base + path);
  if (!resp.ok) throw new Error(`${resp.status} ${path}`);
  return resp.json();
}

async function send<T>(method: "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const resp = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => null);
    throw new Error(detail?.detail || `${resp.status} ${path}`);
  }
  return resp.json();
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v);
  if (!entries.length) return "";
  return "?" + new URLSearchParams(entries as [string, string][]).toString();
}

export type StoryFilters = { status?: string; source_country?: string; about_country?: string };

export const fetchStories = (filters: StoryFilters = {}) =>
  get<StoryCard[]>("/stories" + qs(filters));
export const fetchArc = (id: number) => get<StoryArc>(`/stories/${id}/arc`);
export const fetchOutlets = (id: number) =>
  get<OutletRow[]>(`/stories/${id}/outlets`);
export const fetchSearch = (q: string) =>
  get<ArticleOut[]>(`/search?q=${encodeURIComponent(q)}`);

export type CountryInfo = {
  code: string;
  name: string;
  source_article_count: number;
  story_count: number;
};
export const fetchCountries = () => get<CountryInfo[]>("/countries");

export const postStoryFeedback = (id: number, direction: "more" | "less") =>
  send<{ ok: boolean }>("POST", `/stories/${id}/feedback`, { direction });

export const CATEGORIES = [
  "politics",
  "conflict",
  "disaster",
  "crime",
  "health",
  "economy",
  "sports",
  "science_tech",
  "culture",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type BiasPref = "balanced" | "everything" | "challenge";

export type Me = {
  id: number;
  email: string;
  display_name: string;
  favourite_category: Category | null;
  categories: Category[];
  bias_pref: BiasPref;
  keywords: string[];
  countries: string[];
};

export type ForYouCard = StoryCard & {
  category: Category | null;
  size: "hero" | "standard" | "compact";
  matched: string[];
};

export async function fetchMe(): Promise<Me | null> {
  const resp = await fetch(base + "/me");
  if (resp.status === 401) return null;
  if (!resp.ok) throw new Error(`${resp.status} /me`);
  return resp.json();
}

export const signup = (email: string, password: string, display_name: string) =>
  send<Me>("POST", "/auth/signup", { email, password, display_name });

export const login = (email: string, password: string) =>
  send<Me>("POST", "/auth/login", { email, password });

export const logout = () => send<{ ok: boolean }>("POST", "/auth/logout");

export const putPreferences = (prefs: {
  display_name?: string;
  favourite_category: string | null;
  categories: string[];
  bias_pref: BiasPref;
  keywords: string[];
  countries: string[];
}) => send<Me>("PUT", "/me/preferences", prefs);

export type ForYouFilters = { source_country?: string; about_country?: string };

export const fetchForYou = (filters: ForYouFilters = {}) =>
  get<ForYouCard[]>("/foryou" + qs(filters));

export const fetchStoryExplanation = (id: number) =>
  get<StoryExplanation>(`/stories/${id}/explanation`);
export const stepStoryExplanation = (id: number, refresh = false) =>
  send<StoryExplanation>("POST", `/stories/${id}/explanation/step`, { refresh });
