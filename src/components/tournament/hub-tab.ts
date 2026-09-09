/**
 * The public hub's three tabs and the `?tab=` value that names each one.
 *
 * Plain module on purpose: the page (a server component) reads `searchParams`
 * through `parseHubTab`, and a function exported from a "use client" file
 * cannot be called on the server. Anything the hub and the page both need
 * about tabs lives here.
 */
export type HubTab = "table" | "matches" | "scorers";

export const HUB_TABS: { key: HubTab; label: string }[] = [
  { key: "table", label: "Table" },
  { key: "matches", label: "Matches" },
  { key: "scorers", label: "Scorers" },
];

export const DEFAULT_HUB_TAB: HubTab = "matches";

export function parseHubTab(value: string | string[] | null | undefined): HubTab {
  const v = Array.isArray(value) ? value[0] : value;
  return HUB_TABS.some((t) => t.key === v) ? (v as HubTab) : DEFAULT_HUB_TAB;
}

/** `#round-round-3` style anchor for a group header, from its label. */
export function roundAnchorId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `round-${slug || "tbd"}`;
}
