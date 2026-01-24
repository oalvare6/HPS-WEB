import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface SectionProps {
  children: ReactNode;
  className?: string;
  container?: boolean;
  dark?: boolean;
}

export function Section({ children, className, container = true, dark = false }: SectionProps) {
  return (
    <section
      className={cn(
        "py-20 md:py-28",
        dark ? "bg-zinc-950 text-white" : "bg-white",
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

export function SectionHeader({ title, subtitle, align = "left", dark = false }: SectionHeaderProps) {
  return (
    <div className={cn("mb-12", align === "center" && "text-center")}>
      <h2
        className={cn(
          "text-3xl md:text-4xl font-semibold tracking-tight",
          dark ? "text-white" : "text-zinc-900"
        )}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className={cn(
            "mt-4 text-lg",
            dark ? "text-zinc-400" : "text-zinc-600"
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
