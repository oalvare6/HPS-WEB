import { ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A signed-in player's waiver standing, as one line.
 *
 * Lives in its own file rather than beside the header because both the desktop
 * dropdown (`AccountMenu`) and the mobile sheet (`header-client`) render it,
 * and those two already import each other — putting it in either one makes the
 * cycle real.
 *
 * The label is pre-formatted on the server (`components/layout/header.tsx`), so
 * nothing here does date maths or has an opinion about the viewer's timezone.
 */
export type HeaderWaiverStatus = {
  tone: "ok" | "warn";
  label: string;
};

export function WaiverStatusLine({
  status,
  className,
}: {
  status: HeaderWaiverStatus;
  className?: string;
}) {
  const ok = status.tone === "ok";
  return (
    <p
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        ok ? "text-green-400" : "text-yellow-400",
        className
      )}
    >
      {ok ? (
        <ShieldCheck size={12} aria-hidden="true" />
      ) : (
        <ShieldAlert size={12} aria-hidden="true" />
      )}
      {status.label}
    </p>
  );
}
