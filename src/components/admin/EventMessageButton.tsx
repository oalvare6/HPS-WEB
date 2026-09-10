"use client";

import { useState } from "react";
import { adminFetch } from "@/lib/admin-fetch";
import type { RosterPayload, RosterRow } from "@/lib/admin-roster";
import { MessagePreview } from "./MessagePreview";

export function EventMessageButton({
  eventId,
  teamId,
  text,
}: {
  eventId: string;
  teamId?: string;
  text?: string;
}) {
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function open() {
    setLoading(true);
    setError("");
    const result = await adminFetch<RosterPayload>(
      `/api/admin/tournaments/${eventId}/roster`,
    );
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRows(result.data.rows.filter((row) => !teamId || row.teamId === teamId));
  }
  return (
    <div>
      <button
        type="button"
        disabled={loading}
        className="admin-link text-xs"
        onClick={() => void open()}
      >
        {loading ? "Loading players…" : "Preview message"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-amber-200">
          {error}
        </p>
      )}
      {rows && (
        <MessagePreview
          rows={rows}
          initial="announcement"
          initialText={text}
          onClose={() => setRows(null)}
        />
      )}
    </div>
  );
}
