import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { Section } from "@/components/shared/section";
import {
  getCurrentPlayer,
  getPlayerProfileData,
  type PlayerRegistrationRow,
} from "@/lib/player-auth";
import { isContactWaiverValid } from "@/lib/contacts";
import { MeProfileForm } from "./MeProfileForm";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const player = await getCurrentPlayer();
  if (!player) {
    redirect("/login?next=/me");
  }

  const { contact } = player;
  const { registrations, payments } = await getPlayerProfileData(contact.id);
  const upcoming = registrations.filter((r) => isUpcomingStatus(r.tournament_status));
  const past = registrations.filter((r) => !isUpcomingStatus(r.tournament_status));

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-brand mb-2">
                My account
              </p>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
                {displayName(contact.first_name, contact.last_name) || contact.email}
              </h1>
              <p className="text-zinc-400 text-sm">{contact.email}</p>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-border-token rounded-lg px-3 py-2 transition-colors"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-4xl mx-auto px-6 space-y-8">
          <WaiverStatusCard
            waiverSignedAt={contact.waiver_signed_at}
            waiverExpiresAt={contact.waiver_expires_at}
            waiverType={contact.waiver_type}
            isValid={
              contact.waiver_type
                ? isContactWaiverValid(contact, contact.waiver_type)
                : false
            }
          />

          <section>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
              Profile
            </h2>
            <MeProfileForm
              initialContact={{
                first_name: contact.first_name,
                last_name: contact.last_name,
                email: contact.email,
                phone: contact.phone ?? "",
                dob: contact.dob ?? "",
                emergency_name: contact.emergency_name ?? "",
                emergency_phone: contact.emergency_phone ?? "",
              }}
            />
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
              Current registrations
            </h2>
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<Trophy size={20} className="text-zinc-500" />}
                title="No upcoming registrations"
                body="When you register for an upcoming tournament, it shows up here."
                actionHref="/register"
                actionLabel="Register for a tournament"
              />
            ) : (
              <RegistrationsTable rows={upcoming} />
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
              Past registrations
            </h2>
            {past.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={20} className="text-zinc-500" />}
                title="No past registrations yet"
                body="Your history will appear here after your first event."
              />
            ) : (
              <RegistrationsTable rows={past} />
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
              Payment history
            </h2>
            {payments.length === 0 ? (
              <EmptyState
                icon={<CreditCard size={20} className="text-zinc-500" />}
                title="No payments on file"
                body="Once you complete a Stripe checkout, you'll see the receipt here."
              />
            ) : (
              <div className="dashboard-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-token text-left">
                        <th className="px-4 py-3 text-zinc-400 font-medium">
                          Date
                        </th>
                        <th className="px-4 py-3 text-zinc-400 font-medium hidden sm:table-cell">
                          For
                        </th>
                        <th className="px-4 py-3 text-zinc-400 font-medium">
                          Amount
                        </th>
                        <th className="px-4 py-3 text-zinc-400 font-medium">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-border-token last:border-b-0"
                        >
                          <td className="px-4 py-3 text-zinc-300">
                            {formatDate(p.created_at)}
                          </td>
                          <td className="px-4 py-3 text-zinc-300 hidden sm:table-cell">
                            {p.tournament_title ?? p.tournament_name ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-white font-semibold">
                            {formatCurrency(Number(p.amount), p.currency)}
                          </td>
                          <td className="px-4 py-3">
                            <PaymentStatusBadge status={p.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </Section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}

function isUpcomingStatus(status: string | null): boolean {
  return status === "upcoming" || status === "ongoing";
}

function displayName(first: string, last: string): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

function WaiverStatusCard({
  waiverSignedAt,
  waiverExpiresAt,
  waiverType,
  isValid,
}: {
  waiverSignedAt: string | null;
  waiverExpiresAt: string | null;
  waiverType: "adult" | "youth" | null;
  isValid: boolean;
}) {
  if (!waiverSignedAt || !waiverType) {
    return (
      <div className="dashboard-card p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-yellow-500/10 text-yellow-400 flex items-center justify-center shrink-0">
          <ShieldAlert size={18} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">
            Waiver not on file
          </h3>
          <p className="text-sm text-zinc-400 mt-1">
            You&apos;ll be asked to sign the appropriate waiver the next time you
            register.
          </p>
        </div>
      </div>
    );
  }

  if (isValid) {
    return (
      <div className="dashboard-card p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
          <ShieldCheck size={18} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">
            {waiverType === "adult" ? "Adult waiver" : "Youth waiver"} on file
          </h3>
          <p className="text-sm text-zinc-400 mt-1">
            Signed {formatDate(waiverSignedAt)}.{" "}
            {waiverExpiresAt && (
              <>Expires {formatDate(waiverExpiresAt)}.</>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-card p-5 flex items-start gap-4">
      <div className="w-10 h-10 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center shrink-0">
        <ShieldAlert size={18} />
      </div>
      <div>
        <h3 className="text-base font-semibold text-white">Waiver expired</h3>
        <p className="text-sm text-zinc-400 mt-1">
          Your {waiverType} waiver{" "}
          {waiverExpiresAt ? <>expired {formatDate(waiverExpiresAt)}.</> : null}{" "}
          You&apos;ll be asked to re-sign on your next registration.
        </p>
      </div>
    </div>
  );
}

function RegistrationsTable({ rows }: { rows: PlayerRegistrationRow[] }) {
  return (
    <div className="dashboard-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-token text-left">
              <th className="px-4 py-3 text-zinc-400 font-medium">Tournament</th>
              <th className="px-4 py-3 text-zinc-400 font-medium hidden md:table-cell">
                Registered
              </th>
              <th className="px-4 py-3 text-zinc-400 font-medium">Type</th>
              <th className="px-4 py-3 text-zinc-400 font-medium">Payment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-border-token last:border-b-0"
              >
                <td className="px-4 py-3 text-white">
                  {r.tournament_slug ? (
                    <Link
                      href={`/events/${r.tournament_slug}`}
                      className="hover:text-brand"
                    >
                      {r.tournament_title ?? "Untitled tournament"}
                    </Link>
                  ) : (
                    r.tournament_title ?? "Unlinked tournament"
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-400 hidden md:table-cell">
                  {formatDate(r.created_at)}
                </td>
                <td className="px-4 py-3 text-zinc-300 capitalize">
                  {r.registration_type}
                </td>
                <td className="px-4 py-3">
                  <PaymentStatusBadge status={r.payment_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const classes =
    status === "paid" || status === "succeeded"
      ? "bg-brand/20 text-brand"
      : status === "pending"
        ? "bg-yellow-500/20 text-yellow-400"
        : status === "waived"
          ? "bg-zinc-500/20 text-zinc-300"
          : "bg-red-500/20 text-red-400";
  const Icon =
    status === "paid" || status === "succeeded" ? CheckCircle2 : ShieldAlert;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${classes}`}
    >
      <Icon size={12} />
      {status}
    </span>
  );
}

function EmptyState({
  icon,
  title,
  body,
  actionHref,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="dashboard-card p-6 text-center">
      <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center mx-auto mb-3">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="text-sm text-zinc-400 mt-1">{body}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-block mt-4 text-sm text-brand hover:underline"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
