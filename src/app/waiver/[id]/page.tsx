import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  WAIVER_ORG_NAME,
  getWaiverClauses,
  getWaiverTitle,
  type WaiverType,
} from "@/lib/waiver-text";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Signed waiver record | Houston Premier Soccer",
  // A signature record has no business in a search index.
  robots: { index: false, follow: false },
};

/**
 * The producible document behind an in-app signature — what
 * `contacts.waiver_document_url` points at.
 *
 * REBUILD-PLAN §2: "A waiver you cannot produce is not a waiver." This page is
 * the answer to that for in-app signatures. It renders the exact clauses the
 * signer agreed to (looked up by the stored version, never by today's version),
 * plus who signed, when, and from where. Print to PDF and it is a document.
 *
 * Access is capability-based: the URL contains an unguessable UUID and the page
 * is noindex. That is the same posture as a DocuSeal document link.
 */
export default async function WaiverRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: signature } = await supabaseAdmin
    .from("waiver_signatures")
    .select(
      "id, waiver_type, signed_name, signed_at, signer_relationship, ip, user_agent, waiver_version, registration_id, contacts(first_name, last_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!signature) notFound();

  const waiverType: WaiverType = signature.waiver_type === "youth" ? "youth" : "adult";
  const clauses = getWaiverClauses(waiverType);
  const player = embeddedContact(signature);
  const playerName = player
    ? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim()
    : "";

  return (
    <section className="bg-surface text-white py-10 md:py-14 print:bg-white print:text-black">
      <div className="max-w-3xl mx-auto px-6 space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <ShieldCheck size={24} className="text-brand flex-shrink-0 print:hidden" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {getWaiverTitle(waiverType)}
            </h1>
          </div>
          <p className="text-sm text-zinc-400 print:text-zinc-700">
            Signed record. This page is the document of record for this signature.
          </p>
        </header>

        <dl className="dashboard-card p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm print:border print:border-zinc-300">
          <Row label="Signed by" value={signature.signed_name} emphasis />
          <Row
            label="Signed at"
            value={formatTimestamp(signature.signed_at)}
            emphasis
          />
          {playerName && <Row label="Player" value={playerName} />}
          {signature.signer_relationship && (
            <Row label="Relationship to player" value={signature.signer_relationship} />
          )}
          <Row label="Waiver type" value={waiverType === "youth" ? "Youth" : "Adult"} />
          <Row label="Waiver version" value={signature.waiver_version} mono />
          <Row label="Signature reference" value={signature.id} mono />
          {signature.ip && <Row label="Signed from IP" value={String(signature.ip)} mono />}
          {signature.user_agent && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-zinc-500 print:text-zinc-600">Device</dt>
              <dd className="text-zinc-300 print:text-black break-words text-xs font-mono">
                {signature.user_agent}
              </dd>
            </div>
          )}
        </dl>

        <article className="dashboard-card p-6 md:p-8 space-y-6 print:border print:border-zinc-300">
          <p className="text-xs text-zinc-500 print:text-zinc-600">
            The wording below is version{" "}
            <span className="font-mono">{signature.waiver_version}</span> — the
            text that was on screen when this waiver was signed.
          </p>
          {clauses.map((clause) => (
            <div key={clause.heading} className="space-y-1.5">
              <h2 className="text-sm font-semibold text-white print:text-black">
                {clause.heading}
              </h2>
              <p className="text-sm text-zinc-300 print:text-black leading-relaxed">
                {clause.body}
              </p>
            </div>
          ))}
        </article>

        <p className="text-xs text-zinc-500 print:text-zinc-600">
          {WAIVER_ORG_NAME}. Signature captured in-app; the signer typed their
          name to sign. Keep this link — it is the record.
        </p>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  mono = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-zinc-500 print:text-zinc-600">{label}</dt>
      <dd
        className={`${mono ? "font-mono text-xs" : ""} ${
          emphasis ? "text-white font-medium print:text-black" : "text-zinc-300 print:text-black"
        } break-words`}
      >
        {value}
      </dd>
    </div>
  );
}

function embeddedContact(row: {
  contacts?:
    | { first_name?: string | null; last_name?: string | null }
    | { first_name?: string | null; last_name?: string | null }[]
    | null;
}) {
  const raw = row.contacts;
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // Houston time, spelled out, because whoever reads this record later should
  // not have to work out what UTC offset applied on the day.
  return d.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "full",
    timeStyle: "long",
  });
}
