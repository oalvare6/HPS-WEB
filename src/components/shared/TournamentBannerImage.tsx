import Image from "next/image";
import { getTournamentBannerUrl, tournamentUsesPortraitPoster } from "@/lib/tournament-image";
import type { Tournament } from "@/lib/types";

type Props = {
  tournament: Pick<Tournament, "title" | "image_url" | "image_preset">;
  /** `hero` = full-width detail page; `card` = list/featured thumbnail. */
  variant: "hero" | "card";
  priority?: boolean;
  className?: string;
};

/**
 * Renders a tournament banner. Portrait posters (custom `image_url` uploads)
 * use object-contain and a taller aspect ratio so the full flyer is visible.
 */
export function TournamentBannerImage({
  tournament,
  variant,
  priority = false,
  className = "",
}: Props) {
  const src = getTournamentBannerUrl(tournament);
  if (!src) return null;

  const portrait = tournamentUsesPortraitPoster(tournament);

  if (portrait) {
    const frameCls =
      variant === "hero"
        ? "relative w-full max-w-lg mx-auto aspect-[2/3] bg-surface-2"
        : "relative w-full aspect-[2/3] max-h-[420px] mx-auto bg-surface-2";
    return (
      <div className={`${frameCls} ${className}`}>
        <Image
          src={src}
          alt={tournament.title}
          fill
          className="object-contain"
          sizes={
            variant === "hero"
              ? "(max-width: 768px) 100vw, 512px"
              : "(max-width: 768px) 100vw, 400px"
          }
          quality={90}
          priority={priority}
        />
      </div>
    );
  }

  const landscapeCls =
    variant === "hero"
      ? "relative w-full aspect-[16/7] md:aspect-[16/6] bg-surface-2"
      : "relative w-full aspect-[16/7] bg-surface-2 overflow-hidden";

  return (
    <div className={`${landscapeCls} ${className}`}>
      <Image
        src={src}
        alt={tournament.title}
        fill
        className="object-cover"
        sizes={
          variant === "hero"
            ? "(max-width: 1024px) 100vw, 1152px"
            : "(max-width: 768px) 100vw, 896px"
        }
        quality={85}
        priority={priority}
      />
      {variant === "hero" && (
        <div className="absolute inset-0 bg-gradient-to-t from-base/60 via-transparent to-transparent pointer-events-none" />
      )}
      {variant === "card" && (
        <div className="absolute inset-0 bg-gradient-to-t from-base/80 via-transparent to-transparent pointer-events-none" />
      )}
    </div>
  );
}
