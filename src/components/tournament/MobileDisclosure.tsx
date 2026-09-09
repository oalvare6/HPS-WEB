"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A `<details>` that is open on a laptop and collapsed on a phone.
 *
 * CSS cannot set the `open` attribute, so the server renders it open (the
 * no-JS and desktop case) and this closes it once, on mount, when the screen
 * is below Tailwind's `md`. Native details behaviour after that; nothing else
 * is controlled.
 */
export function MobileDisclosure({
  summary,
  children,
  className = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      if (window.matchMedia("(max-width: 767.98px)").matches) el.open = false;
    } catch {
      // No matchMedia: leave it open.
    }
  }, []);

  return (
    <details ref={ref} open className={`group ${className}`}>
      <summary className="flex items-center justify-between gap-3 min-h-[44px] cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown
          size={16}
          aria-hidden
          className="flex-shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
        />
      </summary>
      {children}
    </details>
  );
}
