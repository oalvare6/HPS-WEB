import { cn } from "@/lib/utils";

type StatusType = "open" | "closed" | "warning";

interface StatusItem {
  label: string;
  status: StatusType;
}

interface StatusIndicatorProps {
  items: StatusItem[];
  className?: string;
}

const statusColors: Record<StatusType, string> = {
  open: "bg-green-500",
  closed: "bg-red-500",
  warning: "bg-yellow-500",
};

const statusPulse: Record<StatusType, string> = {
  open: "animate-pulse bg-green-400",
  closed: "bg-red-500",
  warning: "animate-pulse bg-yellow-400",
};

export function StatusIndicator({ items, className }: StatusIndicatorProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-4 md:gap-6", className)}>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75",
                statusPulse[item.status]
              )}
            />
            <span
              className={cn(
                "relative inline-flex h-2.5 w-2.5 rounded-full",
                statusColors[item.status]
              )}
            />
          </span>
          <span className="text-sm font-medium text-zinc-300">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// Compact version for header
export function StatusIndicatorCompact({ items, className }: StatusIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-3 md:gap-4", className)}>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-75",
                statusPulse[item.status]
              )}
            />
            <span
              className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                statusColors[item.status]
              )}
            />
          </span>
          <span className="text-xs font-medium text-zinc-400">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
