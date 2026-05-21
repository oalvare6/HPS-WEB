import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type AdminEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
};

/**
 * Centered empty state for admin list pages. Use inside a dashboard-card or
 * table cell with consistent padding.
 */
export function AdminEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className = "p-10",
}: AdminEmptyStateProps) {
  const action =
    actionLabel &&
    (actionHref ? (
      <Link
        href={actionHref}
        className="inline-flex items-center gap-1.5 mt-4 text-sm text-brand hover:underline"
      >
        {actionLabel}
      </Link>
    ) : onAction ? (
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center gap-1.5 mt-4 text-sm text-brand hover:underline"
      >
        {actionLabel}
      </button>
    ) : null);

  return (
    <div className={`text-center ${className}`}>
      <div className="w-11 h-11 rounded-lg bg-surface-2 flex items-center justify-center mx-auto mb-3 text-zinc-500">
        <Icon size={20} aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">{description}</p>
      {action}
    </div>
  );
}
