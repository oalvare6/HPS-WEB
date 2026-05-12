export type TournamentImagePreset = {
  key: string;
  label: string;
  url: string;
};

export const TOURNAMENT_IMAGE_PRESETS: TournamentImagePreset[] = [
  {
    key: "field-night",
    label: "Field at Night",
    url: "/community/hps-community-7v7.png",
  },
  {
    key: "trophy-dark",
    label: "Trophy",
    url: "https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=1200&q=80",
  },
  {
    key: "soccer-ball",
    label: "Soccer Ball",
    url: "https://images.unsplash.com/photo-1614632537190-23e4b2e69c88?w=1200&q=80",
  },
  {
    key: "team-huddle",
    label: "Team Huddle",
    url: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=80",
  },
  {
    key: "default",
    label: "HPS Logo",
    url: "/brand/hps-badge.png",
  },
];

export function getPresetUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return TOURNAMENT_IMAGE_PRESETS.find((p) => p.key === key)?.url ?? null;
}
