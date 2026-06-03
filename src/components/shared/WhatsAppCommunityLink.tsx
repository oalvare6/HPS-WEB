import type { ReactNode } from "react";
import { getSiteSetting } from "@/lib/site-settings";
import { WhatsAppIcon } from "@/components/shared/WhatsAppIcon";

export type WhatsAppCommunityLinkVariant = "inline" | "card" | "button" | "fab";

type WhatsAppCommunityLinkProps = {
  href: string;
  variant: WhatsAppCommunityLinkVariant;
  className?: string;
  children?: ReactNode;
  /** Show the WhatsApp icon before label text (inline / button / card). */
  showIcon?: boolean;
};

const DEFAULT_LABEL: Record<Exclude<WhatsAppCommunityLinkVariant, "fab">, string> = {
  inline: "Join our WhatsApp community",
  button: "Join WhatsApp",
  card: "Join WhatsApp",
};

function mergeClassNames(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function WhatsAppCommunityLink({
  href,
  variant,
  className,
  children,
  showIcon = variant !== "inline",
}: WhatsAppCommunityLinkProps) {
  if (!href) return null;

  const label = children ?? DEFAULT_LABEL[variant as keyof typeof DEFAULT_LABEL] ?? "WhatsApp";

  if (variant === "fab") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Join our WhatsApp community"
        className={mergeClassNames(
          "fixed z-40 flex items-center gap-2 rounded-full bg-[#25D366] text-white shadow-lg shadow-black/30",
          // Mobile: clear the QuickActionsBar (~5.5rem) + iPhone home-indicator safe area.
          "bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-4 px-3 py-2.5",
          "md:bottom-5 md:right-5 md:gap-2.5 md:pr-4 md:pl-3 md:py-2.5",
          "hover:bg-[#20bd5a] hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200",
          className
        )}
      >
        <WhatsAppIcon className="h-5 w-5 shrink-0 md:h-6 md:w-6" />
        <span className="text-xs font-semibold whitespace-nowrap md:text-sm">
          Join Community
        </span>
      </a>
    );
  }

  if (variant === "button" || variant === "card") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={mergeClassNames(
          "btn-secondary inline-flex w-full items-center justify-center gap-2",
          className
        )}
      >
        {showIcon && <WhatsAppIcon className="h-4 w-4 shrink-0" />}
        {label}
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={mergeClassNames(
        "inline-flex items-center gap-1.5 text-zinc-400 underline underline-offset-2 transition-colors hover:text-white",
        "text-xs sm:text-sm",
        className
      )}
    >
      {showIcon && <WhatsAppIcon className="h-3.5 w-3.5 shrink-0 text-[#25D366]" />}
      {label}
    </a>
  );
}

type FromSiteProps = Omit<WhatsAppCommunityLinkProps, "href">;

/** Server-only: resolves `footer.whatsapp_url` from site settings. */
export async function WhatsAppCommunityLinkFromSite(props: FromSiteProps) {
  const href = await getSiteSetting("footer.whatsapp_url");
  return <WhatsAppCommunityLink href={href} {...props} />;
}
