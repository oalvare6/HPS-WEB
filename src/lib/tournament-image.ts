import type { Tournament } from "@/lib/types";
import { getPresetUrl } from "@/lib/tournament-image-presets";

/** Resolved banner URL from upload or preset. */
export function getTournamentBannerUrl(
  tournament: Pick<Tournament, "image_url" | "image_preset">
): string | null {
  return tournament.image_url || getPresetUrl(tournament.image_preset);
}

/**
 * Custom uploads (e.g. portrait flyers) should render with object-contain so
 * the full poster is visible. Preset landscape photos keep the wide crop.
 */
export function tournamentUsesPortraitPoster(
  tournament: Pick<Tournament, "image_url">
): boolean {
  return Boolean(tournament.image_url);
}
