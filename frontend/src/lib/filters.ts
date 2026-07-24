export type CountryMode = "source" | "about";

export type Filters = {
  country: string | null;
  mode: CountryMode;
  status: string | null; // Feed only; ForYou omits the status toggle
};

// status defaults to "active" so the default Stories view leads with live
// coverage instead of the (much larger) dead/archived backlog; "All" is one
// click away via the status pill group.
export const DEFAULT_FILTERS: Filters = { country: null, mode: "source", status: "active" };
