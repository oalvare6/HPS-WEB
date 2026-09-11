"use client";

import { useMemo, useState } from "react";
import { AdminDialog } from "./AdminDialog";
import { rosterFullName, type RosterRow } from "@/lib/admin-roster";
import {
  AUDIENCE_LABELS,
  MESSAGE_TEMPLATES,
  describeOutcome,
  type MessageAudience,
  type MessageRecipientRow,
  type MessageTemplate,
} from "@/lib/admin-messages";

/**
 * Compose and send a message (Stage 2.3 item B).
 *
 * Stage 2.1 shipped this as a labelled prototype: template, recipients, text,
 * no Send. The layout is unchanged; what is new is that it can now actually
 * send, and three things stand between the owner and a mistake:
 *
 *   1. **The dry run is compulsory.** Send stays disabled until the server has
 *      resolved the audience and said who it will write to. The list on screen
 *      is the server's answer, not the browser's guess — "everyone unpaid" has
 *      to mean who is unpaid now, not who was unpaid when the page loaded.
 *   2. **One idempotency key per composer.** Minted when the dialog opens and
 *      reused for every attempt, so a double-tap returns the first batch instead
 *      of mailing everyone twice. Mail cannot be recalled.
 *   3. **Outcomes are per person.** A failure names who, and Retry addresses
 *      only the failures — never anyone already sent.
 *
 * Without an `eventId` this stays a preview, because a batch belongs to one
 * event and the overview's attention list spans several. Saying so is better
 * than quietly messaging a subset.
 */

type Phase = "composing" | "checked" | "sent";

type PreviewResponse = {
  recipients: Array<{ registrationId: string; name: string; email: string }>;
  skipped: Array<{ registrationId: string; name: string; reason: string }>;
  sample: string;
  warnings: string[];
  providerConfigured: boolean;
  error?: string;
};

type SendResponse = {
  batch_id?: string;
  repeated?: boolean;
  sent?: number;
  failed?: number;
  message?: string | null;
  error?: string;
};

export function MessagePreview({
  rows,
  eventId,
  teamId,
  onClose,
  initial = "payment",
  initialText,
}: {
  rows: RosterRow[];
  /** Absent on the cross-event overview, where sending is not possible. */
  eventId?: string;
  teamId?: string;
  onClose: () => void;
  initial?: MessageTemplate;
  initialText?: string;
}) {
  const canSend = Boolean(eventId);

  const [template, setTemplate] = useState<MessageTemplate>(initial);
  // Annotated: MESSAGE_TEMPLATES is `as const`, so inference would pin these to
  // the literal template strings and refuse any edit the operator makes.
  const [subject, setSubject] = useState<string>(MESSAGE_TEMPLATES[initial].subject);
  const [message, setMessage] = useState<string>(
    initialText?.trim() || MESSAGE_TEMPLATES[initial].body
  );
  const [audience, setAudience] = useState<MessageAudience>(teamId ? "team" : "explicit");
  const [sentBy, setSentBy] = useState("");

  const [selected, setSelected] = useState(
    () => new Set(rows.filter((r) => r.email).map((r) => r.id))
  );

  const [phase, setPhase] = useState<Phase>("composing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [outcome, setOutcome] = useState<{ text: string; batchId: string; failed: number } | null>(null);
  const [recipientRows, setRecipientRows] = useState<MessageRecipientRow[]>([]);

  // One key for the life of this dialog. Every attempt — including a retry of a
  // failed request — carries it, so the server can tell "send again" from
  // "the first send, again".
  const idempotencyKey = useMemo(
    () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `compose-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    []
  );

  function applyTemplate(key: MessageTemplate) {
    setTemplate(key);
    setSubject(MESSAGE_TEMPLATES[key].subject);
    setMessage(MESSAGE_TEMPLATES[key].body);
    setPhase("composing");
    setPreview(null);
  }

  function audiencePayload() {
    return {
      audience,
      team_id: audience === "team" ? teamId : undefined,
      registration_ids: audience === "explicit" ? [...selected] : undefined,
      body: message,
    };
  }

  async function check() {
    if (!eventId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/tournaments/${eventId}/messages/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(audiencePayload()),
      });
      const body = (await res.json()) as PreviewResponse;
      if (!res.ok) throw new Error(body.error || "Could not work out who this would go to.");
      setPreview(body);
      setPhase("checked");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check recipients.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!eventId || !preview) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/tournaments/${eventId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...audiencePayload(),
          idempotency_key: idempotencyKey,
          template,
          subject,
          created_by: sentBy,
        }),
      });
      const body = (await res.json()) as SendResponse;
      if (!res.ok) throw new Error(body.error || "Could not send that message.");

      setOutcome({
        batchId: body.batch_id ?? "",
        failed: body.failed ?? 0,
        text: body.repeated
          ? "That message was already sent. Nothing was sent again."
          : `${body.sent ?? 0} sent${body.failed ? `, ${body.failed} failed` : ""}.`,
      });
      if (body.message) setError(body.message);
      setPhase("sent");
      await loadRecipients(body.batch_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send that message.");
    } finally {
      setBusy(false);
    }
  }

  async function loadRecipients(batchId?: string) {
    if (!eventId || !batchId) return;
    try {
      const res = await fetch(`/api/admin/tournaments/${eventId}/messages`);
      if (!res.ok) return;
      const body = (await res.json()) as {
        batches?: Array<{ id: string; recipients: MessageRecipientRow[] }>;
      };
      setRecipientRows(body.batches?.find((b) => b.id === batchId)?.recipients ?? []);
    } catch {
      /* the outcome summary already told the operator what happened */
    }
  }

  async function retry() {
    if (!eventId || !outcome?.batchId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/tournaments/${eventId}/messages/${outcome.batchId}/retry`,
        { method: "POST" }
      );
      const body = (await res.json()) as SendResponse;
      if (!res.ok) throw new Error(body.error || "Could not retry.");
      setOutcome({
        batchId: outcome.batchId,
        failed: body.failed ?? 0,
        text: `Retry: ${body.sent ?? 0} sent${body.failed ? `, ${body.failed} still failing` : ""}.`,
      });
      if (body.message) setError(body.message);
      await loadRecipients(outcome.batchId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry.");
    } finally {
      setBusy(false);
    }
  }

  const dirty = () => {
    setPhase("composing");
    setPreview(null);
  };

  return (
    <AdminDialog
      title={canSend ? "Send a message" : "Message preview"}
      description={
        canSend
          ? "Check who this goes to, then send. Recipients are worked out on the server when you check."
          : "These players come from more than one event, so this stays a preview. Open an event to send."
      }
      onClose={onClose}
      dismissDisabled={busy}
      widthClass="md:max-w-2xl"
      footer={
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={busy}>
            {phase === "sent" ? "Done" : "Cancel"}
          </button>
          {canSend && phase !== "sent" && (
            <>
              <button type="button" className="btn-secondary" onClick={() => void check()} disabled={busy}>
                {busy ? "Checking…" : "Check recipients"}
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || phase !== "checked" || !preview?.recipients.length || !sentBy.trim()}
                onClick={() => void send()}
              >
                {preview ? `Send to ${preview.recipients.length}` : "Send"}
              </button>
            </>
          )}
          {canSend && phase === "sent" && outcome && outcome.failed > 0 && (
            <button type="button" className="btn-secondary" onClick={() => void retry()} disabled={busy}>
              {busy ? "Retrying…" : `Retry ${outcome.failed} failed`}
            </button>
          )}
        </div>
      }
    >
      {phase === "sent" && outcome ? (
        <div className="space-y-4">
          <p className="text-sm font-medium">{outcome.text}</p>
          {recipientRows.length > 0 && (
            <>
              <p className="text-xs text-zinc-400">{describeOutcome(recipientRows)}</p>
              <ul className="max-h-56 overflow-y-auto divide-y divide-border-token text-xs">
                {recipientRows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                    <span className={r.status === "failed" ? "text-red-400" : ""}>{r.status}</span>
                    <span>{r.name || r.email}</span>
                    <span className="text-zinc-400">{r.email}</span>
                    {r.error && <span className="text-red-400">· {r.error}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-xs text-zinc-400">
            &quot;Sent&quot; means the email provider accepted the message. Bounces are not
            reported back yet.
          </p>
          {error && (
            <p className="text-xs text-amber-200" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <label className="admin-field">
            Template
            <select value={template} onChange={(e) => applyTemplate(e.target.value as MessageTemplate)}>
              {Object.entries(MESSAGE_TEMPLATES).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </label>

          {canSend && (
            <label className="admin-field">
              Who gets this
              <select
                value={audience}
                onChange={(e) => {
                  setAudience(e.target.value as MessageAudience);
                  dirty();
                }}
              >
                <option value="explicit">{`${AUDIENCE_LABELS.explicit} (${selected.size} selected)`}</option>
                <option value="all">{AUDIENCE_LABELS.all}</option>
                <option value="unpaid">{AUDIENCE_LABELS.unpaid}</option>
                <option value="waiver_missing">{AUDIENCE_LABELS.waiver_missing}</option>
                {teamId && <option value="team">{AUDIENCE_LABELS.team}</option>}
              </select>
            </label>
          )}

          {audience === "explicit" && (
            <fieldset className="space-y-2">
              <legend className="text-sm mb-2">Recipients · {selected.size} selected</legend>
              <div className="max-h-40 overflow-y-auto divide-y divide-border-token">
                {rows.map((row) => (
                  <label key={row.id} className="flex items-center gap-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={!row.email}
                      checked={selected.has(row.id)}
                      onChange={(e) => {
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(row.id);
                          else next.delete(row.id);
                          return next;
                        });
                        dirty();
                      }}
                    />
                    <span>
                      {rosterFullName(row)}{" "}
                      <span className="text-zinc-400">{row.email || "— no email on file"}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {canSend && (
            <label className="admin-field">
              Subject
              <input
                type="text"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  dirty();
                }}
                required
              />
            </label>
          )}

          <label className="admin-field">
            Message
            <textarea
              rows={7}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                dirty();
              }}
            />
          </label>
          <p className="text-xs text-zinc-400">
            {"{{first_name}}, {{name}} and {{event}}"} are filled in for each person. Anything
            else is sent exactly as written.
          </p>

          {canSend && (
            <label className="admin-field">
              Sent by
              <input
                type="text"
                placeholder="Your name, for the record"
                value={sentBy}
                onChange={(e) => setSentBy(e.target.value)}
                required
              />
            </label>
          )}

          {preview && (
            <div className="border border-border-token p-3 space-y-2 text-xs">
              <p className="font-medium">
                This will go to {preview.recipients.length}{" "}
                {preview.recipients.length === 1 ? "person" : "people"}.
              </p>
              <ul className="max-h-32 overflow-y-auto">
                {preview.recipients.map((r) => (
                  <li key={r.registrationId} className="py-0.5">
                    {r.name} <span className="text-zinc-400">{r.email}</span>
                  </li>
                ))}
              </ul>
              {preview.skipped.length > 0 && (
                <>
                  <p className="font-medium text-amber-200">
                    {preview.skipped.length} will NOT be messaged:
                  </p>
                  <ul className="max-h-24 overflow-y-auto">
                    {preview.skipped.map((s) => (
                      <li key={s.registrationId} className="py-0.5 text-zinc-400">
                        {s.name} — {s.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {preview.warnings.map((w) => (
                <p key={w} className="text-amber-200">
                  {w}
                </p>
              ))}
              <details>
                <summary className="cursor-pointer text-zinc-400">
                  What the first person will read
                </summary>
                <pre className="whitespace-pre-wrap mt-2">{preview.sample}</pre>
              </details>
            </div>
          )}

          {error && (
            <p className="text-xs text-amber-200" role="alert">
              {error}
            </p>
          )}
          {!canSend && (
            <p className="text-xs text-zinc-400">
              Recipient selection and edits are for this preview only. Nothing is sent or saved.
            </p>
          )}
        </div>
      )}
    </AdminDialog>
  );
}
