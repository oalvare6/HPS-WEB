"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Section } from "@/components/shared/section";
import {
  Loader2,
  Search,
  UserPlus,
  Mail,
  Phone,
  Download,
  Tag,
  Save,
  Trash2,
  GitMerge,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/types";

type ContactWithCounts = Contact;

function handleAuthLost() {
  if (typeof window !== "undefined") window.location.reload();
}

function fullName(c: Contact): string {
  return `${c.first_name} ${c.last_name}`.trim() || c.email;
}

export default function AdminContactsPage() {
  const [contacts, setContacts] = useState<ContactWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [mergeWinner, setMergeWinner] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (tagFilter) params.set("tag", tagFilter);
      const res = await fetch(`/api/admin/contacts?${params.toString()}`);
      if (res.status === 401) return handleAuthLost();
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to load contacts.");
        return;
      }
      setContacts(data.contacts || []);
    } catch {
      toast.error("Failed to load contacts.");
    } finally {
      setLoading(false);
    }
  }, [search, tagFilter]);

  useEffect(() => {
    const t = setTimeout(fetchContacts, 200);
    return () => clearTimeout(t);
  }, [fetchContacts]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) for (const t of c.tags || []) set.add(t);
    return Array.from(set).sort();
  }, [contacts]);

  return (
    <Section dark className="bg-surface">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Contacts</h1>
            <p className="text-zinc-400 text-sm">
              The canonical people in your system. Every registration, drop-in,
              and payment links to one of these.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/api/admin/contacts/export"
              className="btn-secondary text-sm inline-flex items-center gap-1.5"
            >
              <Download size={14} />
              Export CSV
            </a>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="btn-primary text-sm inline-flex items-center gap-1.5"
            >
              <UserPlus size={14} />
              New contact
            </button>
          </div>
        </div>

        {/* Search + tag filter */}
        <div className="dashboard-card p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="search"
              placeholder="Search name, email, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-border-token rounded-md text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand/50"
            />
          </div>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="px-3 py-2 bg-surface-2 border border-border-token rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand/50 sm:w-48"
          >
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {mergeWinner && (
          <div className="dashboard-card p-4 border-brand/40 bg-brand/10 flex items-start gap-3">
            <GitMerge size={16} className="text-brand mt-0.5" />
            <div className="flex-1 text-sm text-zinc-200">
              <p className="font-semibold mb-0.5">Merging into:</p>
              <p className="text-zinc-300">
                {contacts.find((c) => c.id === mergeWinner)
                  ? fullName(contacts.find((c) => c.id === mergeWinner)!)
                  : mergeWinner}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Click the merge icon on a duplicate row to fold it into this one.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMergeWinner(null)}
              className="text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}

        {/* List */}
        <div className="dashboard-card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-zinc-400 inline-flex items-center justify-center gap-2 w-full">
              <Loader2 size={16} className="animate-spin" />
              Loading…
            </div>
          ) : contacts.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-sm">
              No contacts match. Try a different search.
            </div>
          ) : (
            <ul className="divide-y divide-border-token">
              {contacts.map((c) => (
                <ContactRow
                  key={c.id}
                  contact={c}
                  expanded={expandedId === c.id}
                  onToggle={() =>
                    setExpandedId((cur) => (cur === c.id ? null : c.id))
                  }
                  mergeWinner={mergeWinner}
                  onSelectWinner={() => setMergeWinner(c.id)}
                  onMergeInto={async (winnerId) => {
                    if (winnerId === c.id) return;
                    const ok = confirm(
                      `Merge "${fullName(c)}" INTO the selected winner? The loser row will be deleted.`
                    );
                    if (!ok) return;
                    const res = await fetch("/api/admin/contacts/merge", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        winner_id: winnerId,
                        loser_id: c.id,
                      }),
                    });
                    if (res.status === 401) return handleAuthLost();
                    const data = await res.json();
                    if (!res.ok) {
                      toast.error(data.error || "Merge failed.");
                      return;
                    }
                    toast.success("Contacts merged.");
                    setMergeWinner(null);
                    fetchContacts();
                  }}
                  onSaved={fetchContacts}
                />
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-zinc-500">
          Showing up to 100 results. Refine your search to narrow the list.
        </p>
      </div>

      {showCreate && (
        <CreateContactModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchContacts();
          }}
        />
      )}
    </Section>
  );
}

function ContactRow({
  contact,
  expanded,
  onToggle,
  mergeWinner,
  onSelectWinner,
  onMergeInto,
  onSaved,
}: {
  contact: Contact;
  expanded: boolean;
  onToggle: () => void;
  mergeWinner: string | null;
  onSelectWinner: () => void;
  onMergeInto: (winnerId: string) => void;
  onSaved: () => void;
}) {
  return (
    <li>
      <div className="px-4 py-3 flex items-center gap-3 hover:bg-surface-2/50 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="text-zinc-400 hover:text-white"
          aria-label="Expand"
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">
            {fullName(contact)}
          </div>
          <div className="text-xs text-zinc-400 flex items-center gap-3 flex-wrap mt-0.5">
            <span className="inline-flex items-center gap-1">
              <Mail size={11} />
              {contact.email}
            </span>
            {contact.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone size={11} />
                {contact.phone}
              </span>
            )}
            {(contact.tags ?? []).slice(0, 4).map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 text-zinc-300 bg-surface-2 border border-border-token rounded px-1.5 py-0.5"
              >
                <Tag size={9} />
                {t}
              </span>
            ))}
          </div>
        </div>
        {mergeWinner === contact.id ? (
          <span className="text-xs font-mono text-brand uppercase tracking-wider">
            Winner
          </span>
        ) : mergeWinner ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMergeInto(mergeWinner);
            }}
            className="inline-flex items-center gap-1 text-xs text-yellow-400 hover:text-yellow-300"
            title="Merge this contact INTO the selected winner"
          >
            <GitMerge size={12} />
            Merge here
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectWinner();
            }}
            className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-brand"
            title="Use as merge target"
          >
            <GitMerge size={12} />
            Merge…
          </button>
        )}
      </div>
      {expanded && <ContactEditor contact={contact} onSaved={onSaved} />}
    </li>
  );
}

function ContactEditor({
  contact,
  onSaved,
}: {
  contact: Contact;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(contact.first_name);
  const [lastName, setLastName] = useState(contact.last_name);
  const [email, setEmail] = useState(contact.email);
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [dob, setDob] = useState(contact.dob ?? "");
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [tagsText, setTagsText] = useState((contact.tags ?? []).join(", "));
  const [optIn, setOptIn] = useState(contact.marketing_opt_in);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone: phone || null,
          dob: dob || null,
          notes: notes || null,
          tags: tagsText
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          marketing_opt_in: optIn,
        }),
      });
      if (res.status === 401) return handleAuthLost();
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed.");
        return;
      }
      toast.success("Contact saved.");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this contact? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/contacts/${contact.id}`, {
        method: "DELETE",
      });
      if (res.status === 401) return handleAuthLost();
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Delete failed.");
        return;
      }
      toast.success("Contact deleted.");
      onSaved();
    } finally {
      setDeleting(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 bg-surface-2 border border-border-token rounded-md text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand/50";

  return (
    <div className="px-4 pb-4 pt-1 grid gap-3 md:grid-cols-2 bg-base/40">
      <input
        className={inputCls}
        placeholder="First name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
      />
      <input
        className={inputCls}
        placeholder="Last name"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
      />
      <input
        className={inputCls}
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className={inputCls}
        placeholder="Phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        className={inputCls}
        type="date"
        value={dob}
        onChange={(e) => setDob(e.target.value)}
      />
      <input
        className={inputCls}
        placeholder="tags (comma separated)"
        value={tagsText}
        onChange={(e) => setTagsText(e.target.value)}
      />
      <textarea
        className={`${inputCls} md:col-span-2`}
        placeholder="Notes"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <label className="md:col-span-2 inline-flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
          className="w-4 h-4 bg-surface-2 border-border-token rounded text-brand focus:ring-brand"
        />
        Marketing opt-in (include in mass email / SMS exports)
      </label>
      <div className="md:col-span-2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save changes
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="btn-secondary text-sm inline-flex items-center gap-1.5 text-red-400 hover:text-red-300 disabled:opacity-60"
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  );
}

function CreateContactModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const inputCls =
    "w-full px-3 py-2 bg-surface-2 border border-border-token rounded-md text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand/50";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          phone: phone || null,
          tags: ["admin-added"],
        }),
      });
      if (res.status === 401) return handleAuthLost();
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create.");
        return;
      }
      toast.success("Contact created.");
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-border-token rounded-lg p-6 w-full max-w-md space-y-3"
      >
        <h2 className="text-xl font-bold text-white">New contact</h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            className={inputCls}
            placeholder="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <input
            className={inputCls}
            placeholder="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <input
          className={inputCls}
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className={inputCls}
          placeholder="Phone (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
