import { cn } from "@/lib/utils";
import { Calendar, Users } from "lucide-react";

interface EventCardProps {
  title: string;
  date: string;
  division: string;
  teamCount?: string;
  status?: "completed" | "upcoming" | "registration-open";
  className?: string;
}

export function EventCard({
  title,
  date,
  division,
  teamCount,
  status = "completed",
  className,
}: EventCardProps) {
  return (
    <div
      className={cn(
        "dashboard-card p-6 hover:border-zinc-700 transition-colors",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <h3 className="font-semibold text-white">{title}</h3>
        {status === "completed" && (
          <span className="text-xs font-medium text-zinc-400 bg-zinc-800 px-2 py-1 rounded">
            Completed
          </span>
        )}
        {status === "upcoming" && (
          <span className="text-xs font-medium text-white bg-zinc-700 px-2 py-1 rounded">
            Upcoming
          </span>
        )}
        {status === "registration-open" && (
          <span className="text-xs font-medium text-zinc-900 bg-green-500 px-2 py-1 rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-zinc-900 rounded-full animate-pulse" />
            Open
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Calendar size={14} className="text-zinc-500" />
          <span className="font-medium text-white">{date}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Users size={14} className="text-zinc-500" />
          <span>{division}</span>
          {teamCount && <span className="text-zinc-500">• {teamCount}</span>}
        </div>
      </div>
    </div>
  );
}
