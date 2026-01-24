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
        "bg-white border border-zinc-200 rounded-lg p-6 hover:border-zinc-300 transition-colors",
        className
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <h3 className="font-semibold text-zinc-900">{title}</h3>
        {status === "completed" && (
          <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-1 rounded">
            Completed
          </span>
        )}
        {status === "registration-open" && (
          <span className="text-xs font-medium text-white bg-zinc-900 px-2 py-1 rounded">
            Open
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <Calendar size={14} className="text-zinc-400" />
          <span>{date}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <Users size={14} className="text-zinc-400" />
          <span>{division}</span>
          {teamCount && <span className="text-zinc-400">• {teamCount}</span>}
        </div>
      </div>
    </div>
  );
}
