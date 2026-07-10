export type CountryMode = "source" | "about";

export type Filters = {
  country: string | null;
  mode: CountryMode;
  status: string | null; // Feed only; ForYou omits the status toggle
};

export const DEFAULT_FILTERS: Filters = { country: null, mode: "source", status: null };
