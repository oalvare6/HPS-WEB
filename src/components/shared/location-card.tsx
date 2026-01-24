import { MapPin, Navigation, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const ADDRESS = "14602 Ambrose St, Houston, TX 77045";
const GOOGLE_MAPS_URL =
  "https://www.google.com/maps/dir/?api=1&destination=14602+Ambrose+St,+Houston,+TX+77045";
const GOOGLE_MAPS_EMBED_URL =
  "https://www.google.com/maps/search/?api=1&query=14602+Ambrose+St,+Houston,+TX+77045";

interface LocationCardProps {
  className?: string;
  showMap?: boolean;
  compact?: boolean;
}

export function LocationCard({ className, showMap = true, compact = false }: LocationCardProps) {
  return (
    <div
      className={cn(
        "bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden",
        className
      )}
    >
      {/* Map Pin Header */}
      <div className="relative">
        {showMap && (
          <div className="aspect-video bg-zinc-800 relative overflow-hidden">
            {/* Tactical grid pattern overlay */}
            <div className="absolute inset-0 bg-tactical-grid opacity-50" />
            
            {/* Stylized map pin visualization */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                {/* Pulse ring */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 rounded-full border-2 border-green-500/30 animate-ping" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full border border-green-500/50" />
                </div>
                {/* Center pin */}
                <div className="relative z-10 w-12 h-12 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/25">
                  <MapPin size={24} className="text-white" />
                </div>
              </div>
            </div>
            
            {/* Coordinates overlay */}
            <div className="absolute bottom-3 left-3 text-xs font-mono text-zinc-500">
              29.6547° N, 95.4189° W
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className={cn("p-6", compact && "p-4")}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0">
            <MapPin size={20} className="text-green-500" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Houston Premier Soccer</h3>
            <p className="text-zinc-400 text-sm mt-0.5">{ADDRESS}</p>
          </div>
        </div>

        {/* Get Directions Button */}
        <a
          href={GOOGLE_MAPS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-white text-zinc-900 h-12 font-medium rounded-lg hover:bg-zinc-100 transition-colors"
        >
          <Navigation size={18} />
          Get Directions
          <ExternalLink size={14} className="opacity-50" />
        </a>

        {/* Additional info */}
        {!compact && (
          <p className="text-xs text-zinc-500 text-center mt-3">
            Opens in Google Maps
          </p>
        )}
      </div>
    </div>
  );
}

// Inline version for use in other sections
export function LocationInline({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <MapPin size={20} className="text-green-500 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-white font-medium">Houston Premier Soccer</p>
        <p className="text-zinc-400 text-sm">{ADDRESS}</p>
        <a
          href={GOOGLE_MAPS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-green-500 hover:text-green-400 text-sm font-medium mt-2 transition-colors"
        >
          <Navigation size={14} />
          Get Directions
          <ExternalLink size={12} className="opacity-70" />
        </a>
      </div>
    </div>
  );
}
