import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface SectionProps {
  children: ReactNode;
  className?: string;
  container?: boolean;
  dark?: boolean;
}

export function Section({ children, className, container = true, dark = true }: SectionProps) {
  return (
    <section
      className={cn(
        "py-16 md:py-24",
        dark ? "bg-zinc-950 text-white" : "bg-white text-zinc-900",
        className
      )}
    >
      {container ? (
        <div className="max-w-6xl mx-auto px-6">{children}</div>
      ) : (
        children
      )}
    </section>
  );
}

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  dark?: boolean;
}

export function SectionHeader({ title, subtitle, align = "left", dark = true }: SectionHeaderProps) {
  return (
    <div className={cn("mb-10", align === "center" && "text-center")}>
      <h2
        className={cn(
          "text-2xl md:text-3xl font-bold tracking-tight",
          dark ? "text-white" : "text-zinc-900"
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={cn(
            "mt-3 text-lg",
            dark ? "text-zinc-400" : "text-zinc-600"
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
