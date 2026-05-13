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
    key: "stadium-night",
    label: "Stadium Night",
    url: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=1600&q=85",
  },
  {
    key: "match-action",
    label: "Match Action",
    url: "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1600&q=85",
  },
  {
    key: "team-huddle",
    label: "Team Huddle",
    url: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1600&q=85",
  },
  {
    key: "youth-training",
    label: "Youth Training",
    url: "https://images.unsplash.com/photo-1551958219-acbc595b4153?w=1600&q=85",
  },
  {
    key: "trophy-celebration",
    label: "Trophy Celebration",
    url: "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=1600&q=85",
  },
  {
    key: "aerial-field",
    label: "Aerial Field View",
    url: "https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=1600&q=85",
  },
  {
    key: "default",
    label: "Soccer Field",
    url: "https://images.unsplash.com/photo-1459865264687-595d652de67e?w=1600&q=85",
  },
];

export function getPresetUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return TOURNAMENT_IMAGE_PRESETS.find((p) => p.key === key)?.url ?? null;
}
