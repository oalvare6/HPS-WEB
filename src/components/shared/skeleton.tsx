import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
};

/** Pulse placeholder block; pair with layout wrappers for loading UI. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-2/80", className)}
      aria-hidden="true"
    />
  );
}

/** Table body placeholder with header row shape. */
export function TableSkeleton({
  rows = 6,
  columns = 5,
  showHeader = true,
}: {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
}) {
  return (
    <div className="dashboard-card overflow-hidden" aria-busy="true" aria-label="Loading">
      <div className="overflow-x-auto p-1">
        <table className="w-full text-sm">
          {showHeader && (
            <thead>
              <tr className="border-b border-border-token">
                {Array.from({ length: columns }).map((_, i) => (
                  <th key={i} className="px-4 py-3">
                    <Skeleton className="h-3 w-16 max-w-full" />
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {Array.from({ length: rows }).map((_, row) => (
              <tr key={row} className="border-b border-border-token last:border-b-0">
                {Array.from({ length: columns }).map((_, col) => (
                  <td key={col} className="px-4 py-3">
                    <Skeleton
                      className={cn(
                        "h-4",
                        col === 0 ? "w-32" : col === columns - 1 ? "w-20 ml-auto" : "w-24"
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Stat card row used on overview / tournament view. */
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-4 gap-4"
      aria-busy="true"
      aria-label="Loading stats"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="dashboard-card p-4 text-center space-y-2">
          <Skeleton className="h-8 w-16 mx-auto" />
          <Skeleton className="h-3 w-20 mx-auto" />
        </div>
      ))}
    </div>
  );
}

/** Accordion-style list rows (contacts, drop-ins loading). */
export function ListRowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-border-token" aria-busy="true" aria-label="Loading list">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="px-4 py-3 flex items-center gap-3">
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          <div className="flex-1 space-y-2 min-w-0">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/** Form / settings panel placeholder. */
export function FormFieldsSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading form">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="dashboard-card p-5 md:p-6 space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-full max-w-md" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Tournament detail hero + cards while fetching. */
export function TournamentDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading tournament">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
      <StatCardsSkeleton count={4} />
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 dashboard-card p-6 space-y-4">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}

/** /me account page loading shell. */
export function MePageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-6 space-y-8" aria-busy="true" aria-label="Loading account">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="space-y-4">
        <Skeleton className="h-4 w-20" />
        <div className="dashboard-card p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-4 w-40" />
        <TableSkeleton rows={3} columns={4} />
      </div>
    </div>
  );
}
