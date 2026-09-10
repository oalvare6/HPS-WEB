"use client";

import { useState } from "react";
import { AdminDialog } from "./AdminDialog";
import { rosterFullName, type RosterRow } from "@/lib/admin-roster";

const templates = {
  payment: {
    label: "Payment reminder",
    text: "Hi! A quick reminder from Houston Premier Soccer: please complete your outstanding event payment when you can. If you have already paid, contact HPS so we can check your registration. Thank you!",
  },
  waiver: {
    label: "Waiver reminder",
    text: "Hi! Please complete your HPS waiver before you play. Contact Houston Premier Soccer if you need help finding your waiver.",
  },
  schedule: {
    label: "Game information",
    text: "Hi team! Here are the details for our next HPS game:\n\nDate: [add date]\nKickoff: [add time]\nOpponent: [add opponent]\n\nPlease arrive early and check the event page for updates.",
  },
  announcement: {
    label: "Event announcement",
    text: "Hi everyone! An update from Houston Premier Soccer:\n\n[Write your announcement here]",
  },
};
type Template = keyof typeof templates;
export function MessagePreview({
  rows,
  onClose,
  initial = "payment",
  initialText,
}: {
  rows: RosterRow[];
  onClose: () => void;
  initial?: Template;
  initialText?: string;
}) {
  const [template, setTemplate] = useState<Template>(initial);
  const [message, setMessage] = useState(
    initialText?.trim() || templates[initial].text,
  );
  const [selected, setSelected] = useState(
    () => new Set(rows.filter((r) => r.email).map((r) => r.id)),
  );
  return (
    <AdminDialog
      title="Message preview"
      description="Prototype · Nothing is sent or saved. Email delivery will be connected in a later stage."
      onClose={onClose}
      widthClass="md:max-w-2xl"
      footer={
        <button type="button" onClick={onClose} className="btn-secondary">
          Close preview
        </button>
      }
    >
      <label className="admin-field">
        Template
        <select
          value={template}
          onChange={(e) => {
            const key = e.target.value as Template;
            setTemplate(key);
            setMessage(templates[key].text);
          }}
        >
          {Object.entries(templates).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm mb-2">
          Recipients · {selected.size} selected
        </legend>
        <div className="max-h-40 overflow-y-auto divide-y divide-border-token">
          {rows.map((row) => (
            <label
              key={row.id}
              className="flex items-center gap-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                disabled={!row.email}
                checked={selected.has(row.id)}
                onChange={(e) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(row.id);
                    else next.delete(row.id);
                    return next;
                  })
                }
              />
              <span>
                {rosterFullName(row)}{" "}
                <span className="text-zinc-400">
                  {row.email || "— no email on file"}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="admin-field">
        Message
        <textarea
          rows={7}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      <p className="text-xs text-zinc-400">
        Recipient selection and edits are for this preview only. No delivery
        status or reminders are recorded.
      </p>
    </AdminDialog>
  );
}
