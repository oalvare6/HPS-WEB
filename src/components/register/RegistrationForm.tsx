"use client";

import { useEffect, useMemo, useRef, useState, FormEvent } from "react";
import { trackRegistrationEvent } from "@/lib/analytics";
import Link from "next/link";
import {
  Trophy,
  User,
  Mail,
  CalendarDays,
  ShieldAlert,
  ShieldCheck,
  Pencil,
  CheckCircle2,
  Info,
} from "lucide-react";
import { WORLD_CUP_TOURNAMENT_SLUG } from "@/lib/world-cup-pricing";

type RegistrationOption = {
  id: string;
  title: string;
  slug: string;
  format: string | null;
};

/**
 * Personal info prefilled for a logged-in player. When present, the form
 * pre-fills these fields, locks the email to the auth identity, and hides
 * the personal-info block behind an "Edit my info" toggle (collapsed by
 * default when all required fields are non-empty).
 */
export type RegistrationPrefill = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dob: string;
  emergencyName: string;
  emergencyPhone: string;
  hasAdultWaiverOnFile: boolean;
  hasYouthWaiverOnFile: boolean;
};

type RegistrationApiResponse = {
  error?: string;
  signUrl?: string;
  waiverSkipped?: boolean;
  waiverSignedAt?: string | null;
  tournamentTitle?: string | null;
};

type ConfirmationState = {
  tournamentTitle: string | null;
  waiverSignedAt: string | null;
  payUrl: string;
};

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const inputClass =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-colors placeholder:text-zinc-500 disabled:opacity-70 disabled:cursor-not-allowed";

const labelClass = "block text-xs font-medium text-zinc-400 mb-1.5";

export function RegistrationForm({
  tournaments,
  preselectedSlug,
  prefill = null,
}: {
  tournaments: RegistrationOption[];
  preselectedSlug: string | null;
  prefill?: RegistrationPrefill | null;
}) {
  const initialId = useMemo(() => {
    if (preselectedSlug) {
      const match = tournaments.find((t) => t.slug === preselectedSlug);
      if (match) return match.id;
    }
    return tournaments[0]?.id ?? "";
  }, [tournaments, preselectedSlug]);

  // Personal info is fully controlled so we can prefill from the contact row
  // when the player is logged in. When `prefill` is null, all fields default
  // to empty strings and behave exactly like the old uncontrolled form.
  const [firstName, setFirstName] = useState(prefill?.firstName ?? "");
  const [lastName, setLastName] = useState(prefill?.lastName ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone, setPhone] = useState(
    prefill?.phone ? formatPhone(prefill.phone) : ""
  );
  const [dob, setDob] = useState(prefill?.dob ?? "");
  const [emergencyName, setEmergencyName] = useState(
    prefill?.emergencyName ?? ""
  );
  const [emergencyPhone, setEmergencyPhone] = useState(
    prefill?.emergencyPhone ? formatPhone(prefill.emergencyPhone) : ""
  );

  const [tournamentId, setTournamentId] = useState<string>(initialId);
  const [registrationType, setRegistrationType] = useState<string>("");
  const [waiverAccepted, setWaiverAccepted] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(
    null
  );
  const startTracked = useRef(false);

  useEffect(() => {
    if (startTracked.current) return;
    startTracked.current = true;
    trackRegistrationEvent("registration_start", {
      logged_in: Boolean(prefill),
      tournament_count: tournaments.length,
      preselected_slug: preselectedSlug ?? null,
    });
  }, [prefill, tournaments.length, preselectedSlug]);

  // Collapse the personal-info block when the player is logged in AND every
  // required personal field is non-empty. If anything is missing we leave it
  // expanded so the user is nudged to complete it.
  const personalInfoComplete = Boolean(
    prefill &&
      firstName.trim() &&
      lastName.trim() &&
      phone.trim() &&
      dob.trim() &&
      emergencyName.trim() &&
      emergencyPhone.trim()
  );
  const [editingPersonalInfo, setEditingPersonalInfo] = useState(
    !prefill || !personalInfoComplete
  );

  const hasOptions = tournaments.length > 0;
  const isLoggedIn = Boolean(prefill);
  const selectedTournament = tournaments.find((t) => t.id === tournamentId);
  const selectedTournamentTitle = selectedTournament?.title ?? null;
  const isWorldCupSelected =
    selectedTournament?.slug === WORLD_CUP_TOURNAMENT_SLUG;
  const waiverOnFileForType = prefill
    ? registrationType === "adult"
      ? prefill.hasAdultWaiverOnFile
      : registrationType === "youth"
        ? prefill.hasYouthWaiverOnFile
        : false
    : false;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError("");
    setConfirmation(null);

    if (!tournamentId) {
      setSubmitError("Please select a tournament to register for.");
      return;
    }

    setIsSubmitting(true);
    trackRegistrationEvent("registration_form_submit", {
      tournament_id: tournamentId,
      registration_type: registrationType,
      logged_in: Boolean(prefill),
    });

    const payload = {
      tournamentId,
      type: registrationType,
      firstName,
      lastName,
      email,
      phone,
      dob,
      emergencyName,
      emergencyPhone,
    };

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as RegistrationApiResponse;

      if (!response.ok) {
        setSubmitError(
          data.error ||
            "We couldn't save your registration right now. Please try again."
        );
        return;
      }

      if (data.waiverSkipped && data.signUrl) {
        trackRegistrationEvent("registration_waiver_skipped", {
          tournament_id: tournamentId,
          registration_type: registrationType,
        });
        setConfirmation({
          tournamentTitle: data.tournamentTitle ?? selectedTournamentTitle,
          waiverSignedAt: data.waiverSignedAt ?? null,
          payUrl: data.signUrl,
        });
        return;
      }

      if (data.signUrl) {
        trackRegistrationEvent("registration_waiver_needed", {
          tournament_id: tournamentId,
          registration_type: registrationType,
        });
        window.location.href = data.signUrl;
      } else {
        setSubmitError(
          "Registration saved, but we couldn't load the waiver. Please contact us."
        );
      }
    } catch {
      setSubmitError(
        "We couldn't save your registration right now. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <ConfirmationCard
        tournamentTitle={confirmation.tournamentTitle}
        waiverSignedAt={confirmation.waiverSignedAt}
        payUrl={confirmation.payUrl}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {isLoggedIn && (
        <div className="dashboard-card p-4 flex items-start gap-3 bg-brand/5 border-brand/30">
          <ShieldCheck size={16} className="text-brand mt-0.5 flex-shrink-0" />
          <p className="text-sm text-zinc-300">
            Signed in as{" "}
            <span className="font-mono text-white">{prefill?.email}</span>. We
            pre-filled your details below.
          </p>
        </div>
      )}

      {/* Tournament selector */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Trophy size={16} className="text-brand" />
          <label
            htmlFor="tournamentId"
            className="block text-sm font-semibold text-zinc-200"
          >
            Tournament <span className="text-red-400">*</span>
          </label>
        </div>
        {hasOptions ? (
          <select
            id="tournamentId"
            name="tournamentId"
            required
            value={tournamentId}
            onChange={(e) => setTournamentId(e.target.value)}
            className={inputClass}
          >
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.format ? ` — ${t.format}` : ""}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-zinc-400">
            No tournaments are currently open for registration. Please check
            back soon.
          </p>
        )}
      </div>

      {isWorldCupSelected && <WorldCupRegisterInstructions />}

      {/* Registration Type */}
      <div className="space-y-2">
        <label
          htmlFor="type"
          className="block text-sm font-semibold text-zinc-200"
        >
          Registration Type <span className="text-red-400">*</span>
        </label>
        <select
          id="type"
          name="type"
          required
          value={registrationType}
          onChange={(e) => setRegistrationType(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            Select one...
          </option>
          <option value="adult">Adult (18+)</option>
          <option value="youth">Youth (parent/guardian registering)</option>
        </select>
        <p className="text-xs text-zinc-500">
          Adults sign the adult waiver. Youth registrations use the youth
          waiver (signed by a parent or guardian).
        </p>
        {isLoggedIn && registrationType && waiverOnFileForType && (
          <p className="inline-flex items-center gap-1.5 text-xs text-brand mt-1">
            <ShieldCheck size={12} />
            Your {registrationType} waiver is on file — no DocuSeal step
            needed.
          </p>
        )}
      </div>

      {/* Personal info — collapsible when logged in */}
      {isLoggedIn && !editingPersonalInfo ? (
        <PersonalInfoSummary
          firstName={firstName}
          lastName={lastName}
          email={email}
          phone={phone}
          dob={dob}
          emergencyName={emergencyName}
          emergencyPhone={emergencyPhone}
          onEdit={() => setEditingPersonalInfo(true)}
        />
      ) : (
        <PersonalInfoFields
          isLoggedIn={isLoggedIn}
          canCollapse={isLoggedIn && personalInfoComplete}
          onDone={() => setEditingPersonalInfo(false)}
          firstName={firstName}
          setFirstName={setFirstName}
          lastName={lastName}
          setLastName={setLastName}
          email={email}
          setEmail={setEmail}
          phone={phone}
          setPhone={setPhone}
          dob={dob}
          setDob={setDob}
          emergencyName={emergencyName}
          setEmergencyName={setEmergencyName}
          emergencyPhone={emergencyPhone}
          setEmergencyPhone={setEmergencyPhone}
        />
      )}

      {/* Waiver Agreement */}
      <div className="pt-4 border-t border-border-token">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="waiver"
            required
            checked={waiverAccepted}
            onChange={(e) => setWaiverAccepted(e.target.checked)}
            className="w-5 h-5 mt-0.5 border-border-token bg-surface-2 rounded focus:ring-brand text-brand"
          />
          <span className="text-sm text-zinc-400">
            I agree to the waiver and terms of participation. I understand
            that soccer is a physical activity with inherent risks.
          </span>
        </label>
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="w-full btn-primary h-12 disabled:opacity-70 disabled:cursor-not-allowed"
        disabled={isSubmitting || !hasOptions}
      >
        {isSubmitting ? "Saving Registration..." : "Submit Registration"}
      </button>

      {submitError && (
        <p className="text-sm text-red-400 text-center">{submitError}</p>
      )}

      <p className="text-sm text-zinc-500 text-center">
        {isWorldCupSelected
          ? isLoggedIn && registrationType && waiverOnFileForType
            ? "Your waiver is on file — next you'll choose team payment on the pay page (full team, your share, or captain already paid)."
            : "After submitting, you'll sign the waiver, then choose team payment on the pay page. Team name is collected there, not on this form."
          : isLoggedIn && registrationType && waiverOnFileForType
            ? "Your waiver is already on file — we'll take you straight to payment."
            : "After submitting, you'll be directed to sign the waiver. Registration is not complete until the waiver is signed."}
      </p>
    </form>
  );
}

function WorldCupRegisterInstructions() {
  return (
    <div
      className="dashboard-card p-5 space-y-3 border-brand/25 bg-brand/5"
      role="note"
      aria-label="World Cup registration instructions"
    >
      <div className="flex items-start gap-3">
        <Info size={18} className="text-brand mt-0.5 flex-shrink-0" />
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-white">
            World Cup 7v7 — how registration works
          </h2>
          <ul className="text-sm text-zinc-300 space-y-2 list-disc pl-4 marker:text-zinc-500">
            <li>
              <strong className="text-zinc-200">Every player registers here</strong>,
              including the team captain. One form per person on the roster.
            </li>
            <li>
              A signed waiver is required before you play. Choose adult or youth
              below; you will complete DocuSeal after submitting unless your
              waiver is already on file.
            </li>
            <li>
              <strong className="text-zinc-200">Team fee is paid later</strong> on
              the payment page: the captain may pay the full{" "}
              <strong className="text-zinc-200">$960</strong> team fee, or each
              player may pay their share (
              <strong className="text-zinc-200">$960 divided by roster size</strong>,
              roster size 8–12). Your team should agree on the same roster size.
            </li>
            <li>
              Houston Premier Soccer assigns Group A/B schedules and contacts
              captains after payment. That happens outside this form.
            </li>
            <li>
              Do not enter a team name here — you will provide it on the payment
              page when paying the team fee or your share.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function PersonalInfoSummary({
  firstName,
  lastName,
  email,
  phone,
  dob,
  emergencyName,
  emergencyPhone,
  onEdit,
}: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  emergencyName: string;
  emergencyPhone: string;
  onEdit: () => void;
}) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  return (
    <div className="dashboard-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <User size={16} className="text-brand" />
          <span className="text-sm font-semibold text-zinc-200">
            Registering as
          </span>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 text-xs text-brand hover:text-white border border-brand/40 hover:border-white rounded-md px-2.5 py-1 transition-colors"
        >
          <Pencil size={12} />
          Edit my info
        </button>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <SummaryRow label="Name" value={fullName || "—"} />
        <SummaryRow label="Email" value={email || "—"} mono />
        <SummaryRow label="Phone" value={phone || "—"} />
        <SummaryRow label="Date of birth" value={dob || "—"} />
        <SummaryRow
          label="Emergency contact"
          value={
            emergencyName || emergencyPhone
              ? `${emergencyName}${emergencyPhone ? ` (${emergencyPhone})` : ""}`
              : "—"
          }
        />
      </dl>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`text-zinc-200 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function PersonalInfoFields({
  isLoggedIn,
  canCollapse,
  onDone,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  email,
  setEmail,
  phone,
  setPhone,
  dob,
  setDob,
  emergencyName,
  setEmergencyName,
  emergencyPhone,
  setEmergencyPhone,
}: {
  isLoggedIn: boolean;
  canCollapse: boolean;
  onDone: () => void;
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  dob: string;
  setDob: (v: string) => void;
  emergencyName: string;
  setEmergencyName: (v: string) => void;
  emergencyPhone: string;
  setEmergencyPhone: (v: string) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <User size={16} className="text-brand" />
            <span className="text-sm font-semibold text-zinc-200">
              Name <span className="text-red-400">*</span>
            </span>
          </div>
          {canCollapse && (
            <button
              type="button"
              onClick={onDone}
              className="text-xs text-zinc-400 hover:text-white underline underline-offset-2"
            >
              Done editing
            </button>
          )}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className={labelClass}>
              First name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="firstName"
              name="firstName"
              required
              autoComplete="given-name"
              autoCapitalize="words"
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="lastName" className={labelClass}>
              Last name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              id="lastName"
              name="lastName"
              required
              autoComplete="family-name"
              autoCapitalize="words"
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-brand" />
          <span className="text-sm font-semibold text-zinc-200">
            Contact Info <span className="text-red-400">*</span>
          </span>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="email" className={labelClass}>
              Email Address
              {isLoggedIn && (
                <span className="text-zinc-500 font-normal">
                  {" "}
                  (sign-in identity)
                </span>
              )}
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={isLoggedIn}
              disabled={isLoggedIn}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>
              Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              required
              autoComplete="tel"
              placeholder="(555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-brand" />
          <label htmlFor="dob" className="text-sm font-semibold text-zinc-200">
            Date of Birth <span className="text-red-400">*</span>
          </label>
        </div>
        <input
          type="date"
          id="dob"
          name="dob"
          required
          max={new Date().toISOString().split("T")[0]}
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className={`${inputClass} md:max-w-xs`}
        />
        <p className="text-xs text-zinc-500">
          Must be 18+ for adult registration. Youth players must have a parent
          or guardian register.
        </p>
      </div>

      <div className="space-y-4 pt-4 border-t border-border-token">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-yellow-500" />
          <span className="text-sm font-semibold text-zinc-200">
            Emergency Contact <span className="text-red-400">*</span>
          </span>
        </div>
        <p className="text-xs text-zinc-500 -mt-2">
          Someone we can reach in case of an emergency during the event.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="emergencyName" className={labelClass}>
              Emergency contact name
            </label>
            <input
              type="text"
              id="emergencyName"
              name="emergencyName"
              required
              autoCapitalize="words"
              placeholder="First and last name"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="emergencyPhone" className={labelClass}>
              Contact Phone Number
            </label>
            <input
              type="tel"
              id="emergencyPhone"
              name="emergencyPhone"
              required
              placeholder="(555) 123-4567"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(formatPhone(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
        {canCollapse && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onDone}
              className="text-xs text-zinc-400 hover:text-white underline underline-offset-2"
            >
              Done editing — collapse this section
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmationCard({
  tournamentTitle,
  waiverSignedAt,
  payUrl,
}: {
  tournamentTitle: string | null;
  waiverSignedAt: string | null;
  payUrl: string;
}) {
  const paymentLinkTracked = useRef(false);

  useEffect(() => {
    if (paymentLinkTracked.current) return;
    paymentLinkTracked.current = true;
    trackRegistrationEvent("registration_payment_link_shown", {
      source: "registration_confirmation",
      waiver_on_file: Boolean(waiverSignedAt),
    });
  }, [waiverSignedAt]);

  const titleLine = tournamentTitle
    ? `You're registered for ${tournamentTitle}.`
    : "You're registered.";
  const signedDate = formatDate(waiverSignedAt);

  return (
    <div className="dashboard-card p-6 md:p-8 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand/15 text-brand flex items-center justify-center shrink-0">
          <CheckCircle2 size={20} />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg md:text-xl font-semibold text-white">
            {titleLine}
          </h3>
          <p className="text-sm text-zinc-400">
            {signedDate ? (
              <>
                Waiver on file from{" "}
                <span className="text-zinc-200">{signedDate}</span>. No new
                signature needed.
              </>
            ) : (
              <>Waiver on file. No new signature needed.</>
            )}
          </p>
        </div>
      </div>

      <div className="border-t border-border-token pt-5 space-y-3">
        <p className="text-sm text-zinc-400">
          One more step — secure your spot by paying the entry fee.
        </p>
        <Link
          href={payUrl}
          className="btn-primary w-full h-12 inline-flex items-center justify-center"
        >
          Pay here
        </Link>
        <p className="text-xs text-zinc-500 text-center">
          You can also view this registration any time at{" "}
          <Link href="/me" className="underline underline-offset-2">
            My account
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
