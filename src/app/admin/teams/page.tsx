"use client";

import { useCallback, useEffect, useState } from "react";
import { Section } from "@/components/shared/section";
import {
  Loader2,
  UsersRound,
  Plus,
  Trash2,
  UserPlus,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import type { Contact } from "@/lib/types";

type MemberRow = {
  contact_id: string;
  role: "player" | "captain" | "sub";
  contact: { id: string; first_name: string; last_name: string; email: string } | null;
};

type TeamRow = {
  id: string;
  tournament_id: string;
  name: string;
  captain_contact_id: string | null;
  color: string | null;
  notes: string | null;
  created_at: string;
  tournament: { id: string; title: string } | null;
  captain: { id: string; first_name: string; last_name: string; email: string } | null;
  members: MemberRow[] | null;
};

type TournamentOption = { id: string; title: string };

function handleAuthLost() {
  if (typeof window !== "undefined") window.location.reload();
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [filter, setFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set("tournament_id", filter);
      const res = await fetch(`/api/admin/teams?${params.toString()}`);
      if (res.status === 401) return handleAuthLost();
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to load teams.");
        return;
      }
      setTeams(data.teams || []);
    } catch {
      toast.error("Failed to load teams.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/tournaments");
      if (res.status === 401) return handleAuthLost();
      if (!res.ok) return;
      const data = await res.json();
      setTournaments(
        (data.tournaments ?? []).map((t: { id: string; title: string }) => ({
          id: t.id,
          title: t.title,
        }))
      );
    })();
  }, []);

  return (
    <Section dark className="bg-surface">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1 inline-flex items-center gap-2">
              <UsersRound size={26} className="text-brand" />
              Teams
            </h1>
            <p className="text-zinc-400 text-sm">
              Group contacts into rosters per tournament.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-primary text-sm inline-flex items-center gap-1.5"
          >
            <Plus size={14} />
            New team
          </button>
        </div>

        <div className="dashboard-card p-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 bg-surface-2 border border-border-token rounded-md text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand/50 w-full sm:w-72"
          >
            <option value="">All tournaments</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        <div className="dashboard-card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-zinc-400 inline-flex items-center justify-center gap-2 w-full">
              <Loader2 size={16} className="animate-spin" />
              Loading…
            </div>
          ) : teams.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 text-sm">
              No teams yet. Click &quot;New team&quot; to start.
            </div>
          ) : (
            <ul className="divide-y divide-border-token">
              {teams.map((t) => (
                <TeamCard
                  key={t.id}
                  team={t}
                  expanded={expandedId === t.id}
                  onToggle={() =>
                    setExpandedId((cur) => (cur === t.id ? null : t.id))
                  }
                  onChanged={fetchTeams}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {showCreate && (
        <NewTeamModal
          tournaments={tournaments}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchTeams();
          }}
        />
      )}
    </Section>
  );
}

function TeamCard({
  team,
  expanded,
  onToggle,
  onChanged,
}: {
  team: TeamRow;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const handleDelete = async () => {
    if (!confirm(`Delete team "${team.name}"? Members will be unlinked.`)) return;
    const res = await fetch(`/api/admin/teams/${team.id}`, { method: "DELETE" });
    if (res.status === 401) return handleAuthLost();
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || "Delete failed.");
      return;
    }
    toast.success("Team deleted.");
    onChanged();
  };

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-2/40 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold flex items-center gap-2">
            {team.color && (
              <span
                aria-hidden
                className="inline-block w-3 h-3 rounded-full border border-border-token"
                style={{ backgroundColor: team.color }}
              />
            )}
            {team.name}
          </div>
          <div className="text-xs text-zinc-400 flex items-center gap-3 flex-wrap mt-0.5">
            {team.tournament && <span>{team.tournament.title}</span>}
            <span>{team.members?.length ?? 0} members</span>
            {team.captain && (
              <span className="inline-flex items-center gap-1">
                <Shield size={11} className="text-brand" />
                Captain: {team.captain.first_name} {team.captain.last_name}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          className="text-red-400 hover:text-red-300 text-xs inline-flex items-center gap-1"
        >
          <Trash2 size={12} />
          Delete
        </button>
      </button>
      {expanded && (
        <TeamMembersPanel team={team} onChanged={onChanged} />
      )}
    </li>
  );
}

function TeamMembersPanel({
  team,
  onChanged,
}: {
  team: TeamRow;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/admin/contacts?q=${encodeURIComponent(search)}&limit=10`
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.contacts || []);
      }
      setSearching(false);
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  const addMember = async (contactId: string) => {
    const res = await fetch(`/api/admin/teams/${team.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, role: "player" }),
    });
    if (res.status === 401) return handleAuthLost();
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || "Failed to add.");
      return;
    }
    toast.success("Member added.");
    setSearch("");
    setResults([]);
    onChanged();
  };

  const removeMember = async (contactId: string) => {
    const res = await fetch(
      `/api/admin/teams/${team.id}/members?contact_id=${contactId}`,
      { method: "DELETE" }
    );
    if (res.status === 401) return handleAuthLost();
    if (!res.ok) {
      toast.error("Failed to remove.");
      return;
    }
    onChanged();
  };

  return (
    <div className="px-4 pb-4 pt-1 bg-base/40 space-y-3">
      {/* Existing members */}
      {team.members && team.members.length > 0 ? (
        <ul className="divide-y divide-border-token border border-border-token rounded-md overflow-hidden">
          {team.members.map((m) => (
            <li
              key={m.contact_id}
              className="px-3 py-2 flex items-center gap-2 bg-surface-2/50 text-sm"
            >
              <span className="flex-1 text-white">
                {m.contact
                  ? `${m.contact.first_name} ${m.contact.last_name}`.trim() ||
                    m.contact.email
                  : m.contact_id}
              </span>
              <span className="text-xs text-zinc-400 uppercase tracking-wider">
                {m.role}
              </span>
              <button
                type="button"
                onClick={() => removeMember(m.contact_id)}
                className="text-red-400 hover:text-red-300 text-xs inline-flex items-center gap-1"
              >
                <Trash2 size={11} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-500">No members yet.</p>
      )}

      {/* Add member */}
      <div>
        <label className="text-xs text-zinc-400 inline-flex items-center gap-1 mb-1">
          <UserPlus size={11} />
          Add a contact to this team
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts by name or email…"
          className="w-full px-3 py-2 bg-surface-2 border border-border-token rounded-md text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand/50"
        />
        {(searching || results.length > 0) && (
          <div className="mt-2 border border-border-token rounded-md bg-surface-2 divide-y divide-border-token max-h-40 overflow-y-auto">
            {searching && (
              <p className="px-3 py-2 text-xs text-zinc-500">Searching…</p>
            )}
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => addMember(c.id)}
                className="block w-full text-left px-3 py-2 hover:bg-base text-sm text-zinc-200"
              >
                {c.first_name} {c.last_name}{" "}
                <span className="text-zinc-500 text-xs">{c.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NewTeamModal({
  tournaments,
  onClose,
  onCreated,
}: {
  tournaments: TournamentOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id ?? "");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#22d3ee");
  const [saving, setSaving] = useState(false);

  const inputCls =
    "w-full px-3 py-2 bg-surface-2 border border-border-token rounded-md text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand/50";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournament_id: tournamentId,
          name,
          color,
        }),
      });
      if (res.status === 401) return handleAuthLost();
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create.");
        return;
      }
      toast.success("Team created.");
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
        <h2 className="text-xl font-bold text-white">New team</h2>
        <label className="block">
          <span className="text-xs text-zinc-400">Tournament</span>
          <select
            value={tournamentId}
            onChange={(e) => setTournamentId(e.target.value)}
            className={inputCls}
            required
          >
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-zinc-400">Team name</span>
          <input
            className={inputCls}
            placeholder="e.g. Houston Dragons"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="text-xs text-zinc-400">Jersey color (optional)</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-20 bg-surface-2 border border-border-token rounded-md cursor-pointer"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">
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
