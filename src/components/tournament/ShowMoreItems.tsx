"use client";

import { useState, type ReactNode } from "react";

/**
 * Hides a run of already-rendered list items behind one button. The rows are
 * server-rendered children (dates and all), so nothing here formats anything
 * and the server and client cannot disagree about what a row says. Renders
 * inside a `<ul>`: the button is a list item until it is pressed, then the
 * children take its place.
 */
export function ShowMoreItems({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (open) return <>{children}</>;
  return (
    <li className="list-none">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full min-h-[44px] rounded-lg border border-border-token text-sm text-zinc-300 hover:text-white hover:border-brand/50 transition-colors"
      >
        {label}
      </button>
    </li>
  );
}
