import { MapPin, Navigation, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const ADDRESS = "14062 Ambrose St, Houston, TX 77045";
const LATITUDE = 29.6547;
const LONGITUDE = -95.4189;
const GOOGLE_MAPS_URL =
  "https://www.google.com/maps/dir/?api=1&destination=14062+Ambrose+St,+Houston,+TX+77045";
const GOOGLE_MAPS_VIEW_URL =
  "https://www.google.com/maps/search/?api=1&query=14062+Ambrose+St,+Houston,+TX+77045";
// OpenStreetMap embed — no API key, no rate limits, no domain restrictions.
// Google's no-key embed gets blocked on production domains; OSM is the
// reliable always-works option. Operator can switch to Google's Maps Embed
// API later by setting NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY.
const OSM_BBOX = `${LONGITUDE - 0.005},${LATITUDE - 0.004},${LONGITUDE + 0.005},${LATITUDE + 0.004}`;
const OSM_EMBED_URL = `https://www.openstreetmap.org/export/embed.html?bbox=${OSM_BBOX}&layer=mapnik&marker=${LATITUDE},${LONGITUDE}`;

interface LocationCardProps {
  className?: string;
  showMap?: boolean;
  compact?: boolean;
}

export function LocationCard({ className, showMap = true, compact = false }: LocationCardProps) {
  return (
    <div
      className={cn(
        "bg-surface border border-border-token/70 rounded-xl overflow-hidden shadow-xl shadow-black/30",
        className
      )}
    >
      {/* Map */}
      {showMap && (
        <div
          className="relative overflow-hidden border-b-2 border-brand/30"
          style={{ height: compact ? "200px" : "320px" }}
        >
          <iframe
            src={OSM_EMBED_URL}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="absolute inset-0 w-full h-full"
            title="Houston Premier Soccer location"
          />
          {/* Coordinates pill */}
          <div className="absolute bottom-3 left-3 px-2.5 py-1.5 bg-base/90 backdrop-blur-md rounded-md text-xs font-mono text-brand border border-brand/60 shadow-xl shadow-brand/40 pointer-events-none">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" />
              {LATITUDE}° N · {Math.abs(LONGITUDE)}° W
            </div>
          </div>
          {/* Open in Google Maps */}
          <a
            href={GOOGLE_MAPS_VIEW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-3 right-3 px-2 py-1 bg-base/85 backdrop-blur-sm rounded text-xs font-mono text-zinc-300 hover:text-white border border-border-token/60 hover:border-brand/60 transition-colors inline-flex items-center gap-1"
          >
            Google Maps
            <ExternalLink size={10} className="opacity-70" />
          </a>
        </div>
      )}

      {/* Content */}
      <div className={cn("p-6 bg-gradient-to-b from-surface to-surface/95", compact && "p-4")}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-brand/20 to-brand/5 rounded-lg flex items-center justify-center flex-shrink-0 border border-brand/30 shadow-lg shadow-brand/20">
            <MapPin size={20} className="text-brand" />
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
          className="flex items-center justify-center gap-2 w-full bg-brand-deep text-white h-12 font-bold rounded-lg hover:bg-brand transition-all shadow-lg shadow-brand/40 hover:shadow-brand/50 border border-brand"
        >
          <Navigation size={18} />
          Get Directions
          <ExternalLink size={14} className="opacity-70" />
        </a>

        {/* Additional info */}
        {!compact && (
          <div className="mt-3 p-2 bg-surface-2/30 rounded border border-border-token/30">
            <p className="text-xs text-zinc-400 text-center flex items-center justify-center gap-1.5">
              <MapPin size={12} className="text-brand" />
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
