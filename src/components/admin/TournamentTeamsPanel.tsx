"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  CheckCircle,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Shield,
  Trash2,
  UserMinus,
  UsersRound,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { ListRowsSkeleton } from "@/components/shared/skeleton";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

import {
  assignRegistrationToTeam,
  createTeam,
  deleteTeam,
  fetchTeamsForTournament,
  fetchTournamentRegistrations,
  updateTeam,
  type AdminTeamRegistration,
  type AdminTeamRow,
} from "@/lib/admin-teams";

type Props = {
  tournamentId: string;
  /**
   * Optional cap from the tournament row (tournaments.max_teams). Surfaced as
   * the denominator on the "Teams N / max" header. `null` renders "—".
   */
  maxTeams?: number | null;
};

function handleAuthLost(): void {
  if (typeof window !== "undefined") window.location.reload();
}

export default function TournamentTeamsPanel({
  tournamentId,
  maxTeams = null,
}: Props): React.ReactElement {
  const [teams, setTeams] = useState<AdminTeamRow[]>([]);
  const [registrations, setRegistrations] = useState<AdminTeamRegistration[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [teamsRes, regsRes] = await Promise.all([
      fetchTeamsForTournament(tournamentId),
      fetchTournamentRegistrations(tournamentId),
    ]);
    if (teamsRes.error && teamsRes.error.includes("401")) handleAuthLost();
    if (teamsRes.error) {
      setError(teamsRes.error);
    } else {
      setError("");
      setTeams(teamsRes.data ?? []);
    }
    if (regsRes.error) {
      setError((cur) => cur || regsRes.error || "");
    } else {
      setRegistrations(regsRes.data ?? []);
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const teamCount = teams.length;
  const maxLabel = maxTeams === null ? "—" : String(maxTeams);

  const unassigned = useMemo(
    () => registrations.filter((r) => !r.team_id),
    [registrations]
  );

  const regsByTeam = useMemo(() => {
    const map = new Map<string, AdminTeamRegistration[]>();
    for (const r of registrations) {
      if (!r.team_id) continue;
      const list = map.get(r.team_id) ?? [];
      list.push(r);
      map.set(r.team_id, list);
    }
    return map;
  }, [registrations]);

  if (loading) {
    return (
      <div className="dashboard-card overflow-hidden">
        <ListRowsSkeleton rows={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-card p-6">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="text-sm text-zinc-400">
          <span className="text-white font-semibold text-lg">{teamCount}</span>
          <span className="mx-1">/</span>
          <span className="text-zinc-300">{maxLabel}</span>{" "}
          <span className="text-zinc-500">teams</span>
        </div>
        <NewTeamForm
          tournamentId={tournamentId}
          onCreated={() => {
            void load();
          }}
        />
      </div>

      {teams.length === 0 ? (
        <AdminEmptyState
          icon={UsersRound}
          title="No teams yet"
          description="Create a team above, then assign registrants from the unassigned list below."
          className="dashboard-card p-8"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              members={regsByTeam.get(team.id) ?? []}
              onChanged={load}
            />
          ))}
        </div>
      )}

      <UnassignedList
        registrations={unassigned}
        teams={teams}
        onChanged={load}
      />
    </div>
  );
}

function NewTeamForm({
  tournamentId,
  onCreated,
}: {
  tournamentId: string;
  onCreated: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#22d3ee");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Team name is required.");
      return;
    }
    setSaving(true);
    const res = await createTeam({
      tournament_id: tournamentId,
      name: trimmed,
      color,
    });
    setSaving(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? "Failed to create team.");
      return;
    }
    toast.success("Team created.");
    setName("");
    setOpen(false);
    onCreated();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary text-sm inline-flex items-center gap-1.5"
      >
        <Plus size={14} />
        New team
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="dashboard-card p-3 flex flex-wrap items-center gap-2 w-full md:w-auto"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Team name (e.g. Dragons)"
        className="px-3 py-1.5 bg-surface-2 border border-border-token rounded-md text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-brand/50 w-56"
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        aria-label="Jersey color"
        className="h-8 w-12 bg-surface-2 border border-border-token rounded-md cursor-pointer"
      />
      <button
        type="submit"
        disabled={saving}
        className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        Create
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
        className="text-xs text-zinc-400 hover:text-white"
      >
        Cancel
      </button>
    </form>
  );
}

function fullName(r: AdminTeamRegistration): string {
  const name = `${r.first_name} ${r.last_name}`.trim();
  return name.length > 0 ? name : r.email;
}

function TeamCard({
  team,
  members,
  onChanged,
}: {
  team: AdminTeamRow;
  members: AdminTeamRegistration[];
  onChanged: () => void;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState(team.color ?? "#22d3ee");
  const [saving, setSaving] = useState(false);
  const [busyRegId, setBusyRegId] = useState<string | null>(null);
  const [busySetCaptain, setBusySetCaptain] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const captain = members.find(
    (m) => m.contact_id && m.contact_id === team.captain_contact_id
  );

  const handleSave = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Team name is required.");
      return;
    }
    setSaving(true);
    const res = await updateTeam(team.id, { name: trimmed, color });
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Team updated.");
    setEditing(false);
    onChanged();
  };

  const handleSetCaptain = async (contactId: string | null): Promise<void> => {
    setBusySetCaptain(true);
    const res = await updateTeam(team.id, { captain_contact_id: contactId });
    setBusySetCaptain(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    onChanged();
  };

  const handleUnassign = async (registrationId: string): Promise<void> => {
    setBusyRegId(registrationId);
    const res = await assignRegistrationToTeam(registrationId, null);
    setBusyRegId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    onChanged();
  };

  const handleDelete = async (): Promise<void> => {
    if (
      !window.confirm(
        `Delete team "${team.name}"? Its members will move back to Unassigned.`
      )
    ) {
      return;
    }
    setDeleting(true);
    const res = await deleteTeam(team.id);
    setDeleting(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Team deleted.");
    onChanged();
  };

  return (
    <div className="dashboard-card p-4 flex flex-col gap-3">
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 min-w-0 px-2 py-1 bg-surface-2 border border-border-token rounded-md text-sm text-white"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Jersey color"
            className="h-8 w-12 bg-surface-2 border border-border-token rounded-md cursor-pointer"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-xs inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setName(team.name);
              setColor(team.color ?? "#22d3ee");
            }}
            className="text-xs text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            {team.color && (
              <span
                aria-hidden
                className="inline-block w-3 h-3 rounded-full border border-border-token shrink-0"
                style={{ backgroundColor: team.color }}
              />
            )}
            <h3 className="text-white font-semibold truncate">{team.name}</h3>
            <span className="text-xs text-zinc-500 shrink-0">
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-1 text-zinc-400 hover:text-white"
              aria-label="Edit team"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="p-1 text-red-400 hover:text-red-300 disabled:opacity-50"
              aria-label="Delete team"
            >
              {deleting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
            </button>
          </div>
        </div>
      )}

      {captain ? (
        <div className="inline-flex items-center gap-1.5 text-xs text-brand">
          <Shield size={12} />
          Captain: {fullName(captain)}
        </div>
      ) : (
        <div className="text-xs text-zinc-500 italic">No captain set</div>
      )}

      {members.length === 0 ? (
        <p className="text-xs text-zinc-500">
          No members yet. Assign from the Unassigned list below.
        </p>
      ) : (
        <ul className="space-y-1">
          {members.map((m) => {
            const isCaptain =
              !!m.contact_id && m.contact_id === team.captain_contact_id;
            const busy = busyRegId === m.id;
            return (
              <li
                key={m.id}
                className="flex items-center gap-2 bg-surface-2/50 border border-border-token rounded-md px-2.5 py-1.5 text-sm"
              >
                <span className="flex-1 min-w-0 truncate text-white">
                  {fullName(m)}
                </span>
                <PaymentDot status={m.payment_status} />
                <WaiverDot signed={m.waiver_signed} />
                {isCaptain ? (
                  <button
                    type="button"
                    onClick={() => handleSetCaptain(null)}
                    disabled={busySetCaptain}
                    title="Remove captain"
                    className="inline-flex items-center gap-1 text-xs text-brand hover:text-brand/80 disabled:opacity-50"
                  >
                    <Shield size={11} className="fill-current" />
                  </button>
                ) : m.contact_id ? (
                  <button
                    type="button"
                    onClick={() => handleSetCaptain(m.contact_id)}
                    disabled={busySetCaptain}
                    title="Make captain"
                    className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-brand disabled:opacity-50"
                  >
                    <Shield size={11} />
                  </button>
                ) : (
                  <span
                    title="Cannot set as captain: registration has no linked contact (see Phase 5)"
                    className="text-xs text-zinc-700"
                  >
                    <Shield size={11} />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleUnassign(m.id)}
                  disabled={busy}
                  className="text-zinc-400 hover:text-red-300 disabled:opacity-50"
                  aria-label="Remove from team"
                >
                  {busy ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <UserMinus size={12} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function UnassignedList({
  registrations,
  teams,
  onChanged,
}: {
  registrations: AdminTeamRegistration[];
  teams: AdminTeamRow[];
  onChanged: () => void;
}): React.ReactElement {
  return (
    <div className="dashboard-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider inline-flex items-center gap-2">
          <UsersRound size={14} className="text-brand" />
          Unassigned
          <span className="text-zinc-500 normal-case font-normal tracking-normal">
            ({registrations.length})
          </span>
        </h3>
      </div>

      {registrations.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">
          Every registrant is on a team. Nice.
        </p>
      ) : teams.length === 0 ? (
        <p className="text-xs text-zinc-500 italic">
          Create a team above to start assigning these {registrations.length}{" "}
          registrant{registrations.length === 1 ? "" : "s"}.
        </p>
      ) : (
        <ul className="divide-y divide-border-token border border-border-token rounded-md overflow-hidden">
          {registrations.map((r) => (
            <UnassignedRow
              key={r.id}
              registration={r}
              teams={teams}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function UnassignedRow({
  registration,
  teams,
  onChanged,
}: {
  registration: AdminTeamRegistration;
  teams: AdminTeamRow[];
  onChanged: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent): void => {
      if (
        wrapperRef.current &&
        event.target instanceof Node &&
        !wrapperRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleAssign = async (teamId: string): Promise<void> => {
    setAssigning(true);
    setOpen(false);
    const res = await assignRegistrationToTeam(registration.id, teamId);
    setAssigning(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    onChanged();
  };

  return (
    <li className="px-3 py-2 flex items-center gap-2 bg-surface-2/40 text-sm">
      <span className="flex-1 min-w-0 truncate text-white">
        {fullName(registration)}
      </span>
      <span className="text-xs text-zinc-500 truncate hidden sm:inline max-w-[12rem]">
        {registration.email}
      </span>
      <PaymentDot status={registration.payment_status} />
      <WaiverDot signed={registration.waiver_signed} />
      <div className="relative" ref={wrapperRef}>
        <button
          type="button"
          onClick={() => setOpen((cur) => !cur)}
          disabled={assigning}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border-token bg-base hover:border-brand/50 disabled:opacity-50"
        >
          {assigning ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <>
              Assign
              <ChevronDown size={12} />
            </>
          )}
        </button>
        {open && (
          <div className="absolute right-0 mt-1 z-20 w-56 bg-surface border border-border-token rounded-md shadow-lg max-h-60 overflow-y-auto">
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleAssign(t.id)}
                className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-base flex items-center gap-2"
              >
                {t.color && (
                  <span
                    aria-hidden
                    className="inline-block w-2.5 h-2.5 rounded-full border border-border-token"
                    style={{ backgroundColor: t.color }}
                  />
                )}
                <span className="truncate">{t.name}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-2 text-xs text-zinc-500 hover:bg-base inline-flex items-center gap-1"
            >
              <X size={11} />
              Cancel
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function PaymentDot({ status }: { status: string }): React.ReactElement {
  const isPaid = status === "paid";
  return (
    <span
      title={`Payment: ${status}`}
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${
        isPaid ? "bg-brand/20 text-brand" : "bg-base text-zinc-500"
      }`}
    >
      {isPaid ? <CheckCircle size={10} /> : <XCircle size={10} />}
    </span>
  );
}

function WaiverDot({ signed }: { signed: boolean }): React.ReactElement {
  return (
    <span
      title={`Waiver: ${signed ? "signed" : "unsigned"}`}
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${
        signed ? "bg-brand/20 text-brand" : "bg-base text-zinc-500"
      }`}
    >
      {signed ? <CheckCircle size={10} /> : <XCircle size={10} />}
    </span>
  );
}
