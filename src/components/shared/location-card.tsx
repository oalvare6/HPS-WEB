import { MapPin, Navigation, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const ADDRESS = "14062 Ambrose St, Houston, TX 77045";
const GOOGLE_MAPS_URL =
  "https://www.google.com/maps/dir/?api=1&destination=14062+Ambrose+St,+Houston,+TX+77045";
const GOOGLE_MAPS_EMBED_URL =
  "https://www.google.com/maps/search/?api=1&query=14062+Ambrose+St,+Houston,+TX+77045";

interface LocationCardProps {
  className?: string;
  showMap?: boolean;
  compact?: boolean;
}

export function LocationCard({ className, showMap = true, compact = false }: LocationCardProps) {
  return (
    <div
      className={cn(
        "bg-zinc-900 border border-zinc-700/70 rounded-xl overflow-hidden shadow-xl shadow-black/30",
        className
      )}
    >
      {/* Map Pin Header */}
      <div className="relative">
        {showMap && (
          <div className="aspect-video bg-zinc-800 relative overflow-hidden border-b-2 border-green-900/30">
            {/* Google Maps Embed - Satellite View */}
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3466.1234567890!2d-95.4189!3d29.6547!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2s14062%20Ambrose%20St%2C%20Houston%2C%20TX%2077045!5e1!3m2!1sen!2sus!4v1234567890"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 w-full h-full"
            />
            
            {/* Coordinates overlay with green accent */}
            <div className="absolute bottom-3 left-3 px-2.5 py-1.5 bg-zinc-950/95 backdrop-blur-md rounded-md text-xs font-mono text-green-400 border border-green-700/60 shadow-xl shadow-green-900/40">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                29.6547° N, 95.4189° W
              </div>
            </div>
            
            {/* Map type indicator */}
            <div className="absolute top-3 right-3 px-2 py-1 bg-zinc-950/80 backdrop-blur-sm rounded text-xs font-mono text-zinc-400 border border-zinc-700/50">
              Satellite
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className={cn("p-6 bg-gradient-to-b from-zinc-900 to-zinc-900/95", compact && "p-4")}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-green-900/40 to-green-950/40 rounded-lg flex items-center justify-center flex-shrink-0 border border-green-800/30 shadow-lg shadow-green-900/20">
            <MapPin size={20} className="text-green-500" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Houston Premier Soccer</h3>
            <p className="text-zinc-300 text-sm mt-0.5">{ADDRESS}</p>
          </div>
        </div>

        {/* Get Directions Button */}
        <a
          href={GOOGLE_MAPS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-green-700 text-white h-12 font-bold rounded-lg hover:bg-green-600 transition-all shadow-lg shadow-green-900/40 hover:shadow-green-800/50 border border-green-600"
        >
          <Navigation size={18} />
          Get Directions
          <ExternalLink size={14} className="opacity-70" />
        </a>

        {/* Additional info */}
        {!compact && (
          <div className="mt-3 p-2 bg-zinc-800/30 rounded border border-zinc-700/30">
            <p className="text-xs text-zinc-400 text-center flex items-center justify-center gap-1.5">
              <MapPin size={12} className="text-green-500" />
              Opens in Google Maps
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Inline version for use in other sections
export function LocationInline({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <MapPin size={20} className="text-white mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-white font-medium">Houston Premier Soccer</p>
        <p className="text-zinc-400 text-sm">{ADDRESS}</p>
        <a
          href={GOOGLE_MAPS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-white hover:text-zinc-300 text-sm font-medium mt-2 transition-colors"
        >
          <Navigation size={14} />
          Get Directions
          <ExternalLink size={12} className="opacity-70" />
        </a>
      </div>
    </div>
  );
}
