"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

export type Crumb = {
  label: string;
  /** When omitted, the crumb is rendered as the current page (no link). */
  href?: string;
};

/**
 * Shared admin breadcrumb trail (Phase 4).
 *
 * Detail and edit pages render one of these near the top of the page so the
 * admin always knows where they are and can hop back up the hierarchy in one
 * click. The final crumb is rendered as plain text and marked aria-current.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-zinc-400">
        {items.map((crumb, i) => {
          const isLast = i === items.length - 1;
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              <li className="inline-flex items-center min-w-0">
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-white transition-colors truncate"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={
                      isLast ? "text-white truncate" : "truncate"
                    }
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
              {!isLast && (
                <li aria-hidden="true" className="text-zinc-600 inline-flex">
                  <ChevronRight size={14} />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
