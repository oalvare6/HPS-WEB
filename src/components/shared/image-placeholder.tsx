import { cn } from "@/lib/utils";

interface ImagePlaceholderProps {
  caption: string;
  aspectRatio?: "video" | "square" | "portrait";
  className?: string;
}

export function ImagePlaceholder({
  caption,
  aspectRatio = "video",
  className,
}: ImagePlaceholderProps) {
  const aspectClasses = {
    video: "aspect-video",
    square: "aspect-square",
    portrait: "aspect-[3/4]",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-zinc-100",
        aspectClasses[aspectRatio],
        className
      )}
    >
      {/* Subtle pattern */}
      <div className="absolute inset-0 opacity-50">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e4e4e7" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
      
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      
      {/* Caption */}
      <div className="absolute bottom-0 left-0 right-0 p-4">
        <span className="text-white text-sm font-medium">{caption}</span>
      </div>
    </div>
  );
}
