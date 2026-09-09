"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * One dialog for the admin. The markup is the Sign-now dialog from
 * RosterScreen (dark overlay, dashboard-card panel, title, X to close), with
 * the three things every hand-rolled copy forgot added once here: Escape
 * closes it, the page behind it stops scrolling, and focus moves inside.
 *
 * Below `md` the panel is a bottom sheet (the owner is on a phone at the
 * field); from `md` up it is centred. Tapping the dark overlay does NOT close
 * it: a stray thumb must not throw away a half-typed result.
 */
type AdminDialogProps = {
  title: string;
  /** One quiet line under the title. */
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Buttons pinned under the content; optional. */
  footer?: ReactNode;
  /** Tailwind max-width for the centred (md+) layout. */
  widthClass?: string;
};

export function AdminDialog({
  title,
  description,
  onClose,
  children,
  footer,
  widthClass = "md:max-w-lg",
}: AdminDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape closes. Registered once per mount; the ref keeps the latest handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Lock the page behind the dialog while it is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Move focus inside. A child with autoFocus wins; otherwise the panel itself
  // takes focus so the next Tab lands on the first control.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const active = document.activeElement;
    if (active && panel.contains(active)) return;
    panel.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center md:p-4"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`dashboard-card w-full max-h-[92vh] overflow-y-auto p-5 space-y-4 outline-none max-md:!rounded-t-2xl max-md:!rounded-b-none ${widthClass}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            {description && (
              <p className="text-xs text-zinc-400 mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {children}

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-token pt-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
