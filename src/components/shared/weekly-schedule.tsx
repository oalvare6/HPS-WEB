"use client";

import { Calendar, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface Game {
  time: string;
  homeTeam: string;
  awayTeam: string;
}

interface DaySchedule {
  day: string;
  date?: string;
  games: Game[];
}

interface LeagueSchedule {
  name: string;
  type: "youth" | "adult";
  days: DaySchedule[];
}

interface WeeklyScheduleProps {
  leagues: LeagueSchedule[];
  className?: string;
}

export function WeeklySchedule({ leagues, className }: WeeklyScheduleProps) {
  const getDayLabel = (day: string) => {
    const today = new Date();
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayIndex = dayNames.findIndex(d => d.toLowerCase() === day.toLowerCase());
    
    if (dayIndex === -1) return day;
    
    const nextOccurrence = new Date(today);
    const daysUntil = (dayIndex - today.getDay() + 7) % 7 || 7;
    nextOccurrence.setDate(today.getDate() + daysUntil);
    
    return `${day} ${nextOccurrence.getMonth() + 1}/${nextOccurrence.getDate()}`;
  };

  return (
    <div className={cn("space-y-8", className)}>
      {leagues.map((league, leagueIdx) => (
        <div key={leagueIdx} className="dashboard-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center",
              league.type === "youth" ? "bg-zinc-800" : "bg-zinc-800"
            )}>
              <Users 
                size={20} 
                className="text-white" 
              />
            </div>
            <div>
              <h3 className="font-semibold text-white text-lg">{league.name}</h3>
              <p className="text-sm text-zinc-400">
                {league.type === "youth" ? "Youth League" : "Adult League"}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {league.days.map((daySchedule, dayIdx) => (
              <div key={dayIdx}>
                <div className="flex items-center gap-2 mb-4">
                  <Calendar size={16} className="text-white" />
                  <h4 className="font-medium text-white">
                    {daySchedule.date || getDayLabel(daySchedule.day)}
                  </h4>
                </div>
                
                {daySchedule.games.length > 0 ? (
                  <div className="space-y-3 pl-6 border-l-2 border-zinc-800">
                    {daySchedule.games.map((game, gameIdx) => (
                      <div 
                        key={gameIdx}
                        className="flex items-center justify-between p-3 bg-zinc-800/30 rounded-lg hover:bg-zinc-800/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <Clock size={14} className="text-zinc-500 flex-shrink-0" />
                          <span className="text-sm font-medium text-zinc-300">{game.time}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-white">
                          <span className="font-medium">{game.homeTeam}</span>
                          <span className="text-zinc-500">vs</span>
                          <span className="font-medium">{game.awayTeam}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="pl-6 text-sm text-zinc-500 italic">
                    No games scheduled
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
