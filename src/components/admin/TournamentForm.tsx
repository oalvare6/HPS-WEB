"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Upload,
  Image as ImageIcon,
  Check,
  ChevronDown,
  Star,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { TOURNAMENT_FORMATS, type Tournament } from "@/lib/types";
import { TOURNAMENT_IMAGE_PRESETS, getPresetUrl } from "@/lib/tournament-image-presets";
import { slugify } from "@/lib/slug";
import { dateInputToIsoPreservingCalendarDay } from "@/lib/date-input";
import { deriveStoredStatus, isPastEvent } from "@/lib/tournament-state";

const DEFAULT_LOCATION = "14062 Ambrose St, Houston TX";

/**
 * The states an operator can actually *choose* (D1).
 *
 * `finished` is deliberately absent: it is derived from the end date by
 * `isPastEvent`, never stored. If it were selectable, the owner could mark a
 * future event finished, or leave a past event open — which is exactly the
 * failure this replaces.
 */
type StoredEventState = "draft" | "open" | "closed" | "cancelled";

const EVENT_STATE_OPTIONS: {
  value: StoredEventState;
  label: string;
  /** Shown under the dropdown once selected — plain English, no jargon. */
  help: string;
}[] = [
  {
    value: "draft",
    label: "Draft — hidden from the public",
    help: "Only you can see this event. Nobody can find it, sign up, or pay.",
  },
  {
    value: "open",
    label: "Open — taking sign-ups and payments",
    help: "The event is on the site, people can sign up and pay.",
  },
  {
    value: "closed",
    label: "Closed — on the site, but not taking money",
    help: "People can see the event and the schedule, but sign-ups and payments are turned off.",
  },
  {
    value: "cancelled",
    label: "Cancelled — called off",
    help: "The event is removed from the site. Use this if it was called off.",
  },
];

/**
 * Which state to show for an event that is already stored. Mirrors
 * `resolveEventState` minus the calendar backstop — "finished" is rendered
 * separately, not selected, so the operator's underlying choice stays intact.
 */
function storedStateFrom(t: Tournament | null): StoredEventState {
  // A brand-new event starts hidden. The owner publishes it deliberately.
  if (!t) return "draft";
  if (t.status === "cancelled") return "cancelled";
  if (t.is_draft) return "draft";
  if (t.registration_open || t.payments_open) return "open";
  return "closed";
}

function formatEventDay(dateInput: string): string {
  const iso = dateInputToIsoPreservingCalendarDay(dateInput);
  if (!iso) return dateInput;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

type FormState = {
  title: string;
  slug: string;
  format: string;
  description: string;
  /**
   * The one switch (D1). The only in-form representation of what used to be
   * three separate fields — status, registration_open and payments_open. They
   * are derived from this on save and never held separately, so the form has no
   * way to represent a contradiction.
   */
  state: StoredEventState;
  start_date: string;
  end_date: string;
  recurrence: string;
  time_start: string;
  time_end: string;
  location: string;
  entry_fee: string;
  /**
   * Whether the public /pay page should offer the "Guest / Single-round" tier
   * for this event. When false, the payload sends `drop_in_fee_cents: 0` and
   * the Guest card on /pay is suppressed. Open-play one-offs (e.g. Memorial
   * Day) typically set this to false so only the entry fee shows.
   */
  offer_drop_in_tier: boolean;
  /** Dollar string. Only used when `offer_drop_in_tier` is true. */
  drop_in_fee: string;
  max_teams: string;
  register_url: string;
  pay_url: string;
  image_url: string | null;
  image_preset: string | null;
  display_order: string;
  is_featured: boolean;
};

const DEFAULT_DROP_IN_FEE_CENTS = 2000;

function toDateInput(value: string | null): string {
  if (!value) return "";
  // Slice YYYY-MM-DD from ISO string
  return value.slice(0, 10);
}

function fromInitial(t: Tournament | null): FormState {
  const initialDropInCents = t?.drop_in_fee_cents ?? DEFAULT_DROP_IN_FEE_CENTS;
  const offerDropInTier = initialDropInCents > 0;
  const dropInDollars = offerDropInTier
    ? (initialDropInCents / 100).toFixed(2)
    : (DEFAULT_DROP_IN_FEE_CENTS / 100).toFixed(2);
  return {
    title: t?.title ?? "",
    slug: t?.slug ?? "",
    format: t?.format ?? "Adult 7v7",
    description: t?.description ?? "",
    state: storedStateFrom(t),
    start_date: toDateInput(t?.start_date ?? null),
    end_date: toDateInput(t?.end_date ?? null),
    recurrence: t?.recurrence ?? "",
    time_start: t?.time_start ?? "",
    time_end: t?.time_end ?? "",
    location: t?.location ?? DEFAULT_LOCATION,
    entry_fee: t?.entry_fee != null ? String(t.entry_fee) : "",
    offer_drop_in_tier: offerDropInTier,
    drop_in_fee: dropInDollars,
    max_teams: t?.max_teams != null ? String(t.max_teams) : "",
    register_url: t?.register_url ?? "",
    pay_url: t?.pay_url ?? "",
    image_url: t?.image_url ?? null,
    image_preset: t?.image_preset ?? null,
    display_order: t?.display_order != null ? String(t.display_order) : "0",
    is_featured: t?.is_featured ?? false,
  };
}

export function TournamentForm({ initial }: { initial: Tournament | null }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => fromInitial(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageTab, setImageTab] = useState<"upload" | "preset">(
    initial?.image_url ? "upload" : "preset"
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Auto-derive slug from title until user edits slug field
  useEffect(() => {
    if (!slugTouched) {
      setForm((prev) => ({ ...prev, slug: slugify(prev.title) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title]);

  const previewUrl = useMemo(() => {
    if (form.image_url) return form.image_url;
    return getPresetUrl(form.image_preset);
  }, [form.image_url, form.image_preset]);

  /**
   * "Finished" is a fact about the calendar, not a setting. Recomputed from the
   * dates *currently in the form*, so fixing a wrong end date lifts the lock
   * immediately instead of after a save-and-reload.
   */
  const finished = useMemo(
    () =>
      isPastEvent({
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      }),
    [form.start_date, form.end_date]
  );
  const lastDay = form.end_date || form.start_date;

  const selectedState = EVENT_STATE_OPTIONS.find((o) => o.value === form.state);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Title is required.";
    if (!form.slug.trim()) e.slug = "Slug is required.";
    if (!form.format.trim()) e.format = "Format is required.";
    if (!form.start_date) e.start_date = "Start date is required.";
    if (!form.time_start.trim()) e.time_start = "Start time is required.";
    if (!form.time_end.trim()) e.time_end = "End time is required.";
    if (form.offer_drop_in_tier) {
      const raw = form.drop_in_fee.trim();
      if (!raw) {
        e.drop_in_fee = "Set an amount, or turn off the guest tier.";
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n <= 0) {
          e.drop_in_fee = "Must be a positive number.";
        }
      }
    }
    setErrors(e);
    // Slug and the URLs live behind the disclosure; a hidden error is a dead end.
    if (e.slug || e.register_url || e.pay_url || e.display_order) setAdvancedOpen(true);
    return Object.keys(e).length === 0;
  };

  const handleClearImage = async () => {
    update("image_url", null);
    if (!initial?.id) return;
    try {
      const patchRes = await fetch(`/api/admin/tournaments/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: null, image_preset: null }),
      });
      if (!patchRes.ok) {
        const patchData = (await patchRes.json()) as { error?: string };
        toast.error(patchData.error || "Could not clear image on server.");
        return;
      }
      router.refresh();
      toast.success("Banner image removed from this tournament.");
    } catch {
      toast.error("Could not clear image on server.");
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/tournaments/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Upload failed.");
        return;
      }
      update("image_url", data.url);
      update("image_preset", null);

      if (initial?.id) {
        const patchRes = await fetch(`/api/admin/tournaments/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: data.url, image_preset: null }),
        });
        const patchData = (await patchRes.json()) as { error?: string };
        if (!patchRes.ok) {
          toast.error(patchData.error || "Image stored but could not attach to this tournament.");
          return;
        }
        router.refresh();
        toast.success("Image saved", {
          description: "Stored and linked to this tournament. Other edits still need Save Tournament.",
        });
      } else {
        toast.success("Image uploaded", {
          description: "File is in storage. Click Save Tournament to attach it to this event.",
        });
      }
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    const dropInFeeCents = form.offer_drop_in_tier
      ? Math.max(0, Math.round(Number(form.drop_in_fee) * 100))
      : 0;

    const dates = {
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    };
    /**
     * The one dropdown expanded into the columns that still back it. Every
     * combination is produced here and nowhere else, so the contradictory
     * states the owner used to be able to build by hand — "completed but
     * payments open", "registration open, payments closed" — are simply not
     * reachable any more.
     *
     * A finished event contributes NOTHING: its four state columns are left out
     * of the payload entirely, so saving an edit to a past event (fixing a
     * typo, adding a photo) can never write "finished" into the database. That
     * is D1's rule that finished is derived and never stored.
     */
    const stateFields = finished
      ? {}
      : {
          is_draft: form.state === "draft",
          registration_open: form.state === "open",
          payments_open: form.state === "open",
          status:
            form.state === "cancelled"
              ? ("cancelled" as const)
              : deriveStoredStatus(dates),
        };
    const payload = {
      ...stateFields,
      title: form.title.trim(),
      slug: form.slug.trim(),
      format: form.format,
      description: form.description.trim() || null,
      start_date: form.start_date
        ? dateInputToIsoPreservingCalendarDay(form.start_date) ?? new Date(form.start_date).toISOString()
        : null,
      end_date: form.end_date
        ? dateInputToIsoPreservingCalendarDay(form.end_date) ?? new Date(form.end_date).toISOString()
        : null,
      recurrence: form.recurrence.trim() || null,
      time_start: form.time_start.trim(),
      time_end: form.time_end.trim(),
      location: form.location.trim() || null,
      entry_fee: form.entry_fee.trim() ? Number(form.entry_fee) : null,
      drop_in_fee_cents: dropInFeeCents,
      max_teams: form.max_teams.trim() ? Number(form.max_teams) : null,
      register_url: form.register_url.trim() || null,
      pay_url: form.pay_url.trim() || null,
      image_url: form.image_url,
      image_preset: form.image_preset,
      display_order: form.display_order.trim() ? Number(form.display_order) : 0,
      is_featured: form.state === "draft" ? false : form.is_featured,
    };
    try {
      const url = initial
        ? `/api/admin/tournaments/${initial.id}`
        : "/api/admin/tournaments";
      const method = initial ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed.");
        setSaving(false);
        return;
      }
      toast.success(initial ? "Tournament updated." : "Tournament created.");
      router.push("/admin/tournaments");
      router.refresh();
    } catch {
      toast.error("Save failed.");
      setSaving(false);
    }
  };

  const inputBase =
    "w-full px-4 py-3 bg-surface-2 border text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors";
  const inputCls = (key: keyof FormState) =>
    `${inputBase} ${errors[key] ? "border-red-500" : "border-border-token"}`;

  return (
    <form onSubmit={handleSubmit} className="dashboard-card p-6 md:p-8 space-y-8">
      {/* EVENT STATUS — the one switch (D1) */}
      <Section title="Event Status">
        {finished ? (
          <div className="rounded-lg border border-border-token bg-surface-2/60 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Lock size={16} className="text-zinc-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">
                  Finished{lastDay ? ` — ended ${formatEventDay(lastDay)}` : ""}
                </p>
                <p className="text-xs text-zinc-400">
                  This is set automatically from the dates, so nobody has to remember
                  to turn it off. A finished event stays on the site to look at, but it
                  can never take sign-ups or payments again.
                </p>
              </div>
            </div>
            <select
              value="finished"
              disabled
              className={`${inputBase} border-border-token opacity-60 cursor-not-allowed`}
            >
              <option value="finished">Finished — set automatically</option>
            </select>
            <p className="text-xs text-zinc-500">
              Wrong? Change the End Date below and this unlocks straight away.
            </p>
          </div>
        ) : (
          <Field label="Event status" required>
            <select
              value={form.state}
              onChange={(e) => update("state", e.target.value as StoredEventState)}
              className={inputCls("state")}
            >
              {EVENT_STATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {selectedState && (
              <p className="mt-1 text-xs text-zinc-500">{selectedState.help}</p>
            )}
          </Field>
        )}

        <StarToggle
          label="Show on homepage"
          hint={
            form.state === "draft"
              ? "A draft can't be on the homepage — it isn't public yet."
              : "Up to 3 events at a time."
          }
          checked={form.is_featured}
          disabled={form.state === "draft"}
          onChange={(v) => update("is_featured", v)}
        />
      </Section>

      <Divider />

      {/* BASIC INFO */}
      <Section title="Basic Info">
        <Field label="Tournament Title" required error={errors.title}>
          <input
            type="text"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            className={inputCls("title")}
            placeholder="Spring Classic 2026"
          />
        </Field>
        <Field label="Format" required error={errors.format}>
          <select
            value={form.format}
            onChange={(e) => update("format", e.target.value)}
            className={inputCls("format")}
          >
            {TOURNAMENT_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            className={inputCls("description")}
            placeholder="Short description shown on /events"
          />
        </Field>
      </Section>

      <Divider />

      {/* DATES & TIMES */}
      <Section title="Dates & Times">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Start Date" required error={errors.start_date}>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => update("start_date", e.target.value)}
              className={inputCls("start_date")}
            />
          </Field>
          <Field label="End Date">
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => update("end_date", e.target.value)}
              className={inputCls("end_date")}
            />
          </Field>
        </div>
        <Field label="Recurrence Pattern" hint="e.g. Every Friday starting Mar 27">
          <input
            type="text"
            value={form.recurrence}
            onChange={(e) => update("recurrence", e.target.value)}
            className={inputCls("recurrence")}
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Time Start" required error={errors.time_start}>
            <input
              type="text"
              value={form.time_start}
              onChange={(e) => update("time_start", e.target.value)}
              className={inputCls("time_start")}
              placeholder="7:00 PM"
            />
          </Field>
          <Field label="Time End" required error={errors.time_end}>
            <input
              type="text"
              value={form.time_end}
              onChange={(e) => update("time_end", e.target.value)}
              className={inputCls("time_end")}
              placeholder="10:00 PM"
            />
          </Field>
        </div>
        <Field label="Location">
          <input
            type="text"
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
            className={inputCls("location")}
            placeholder={DEFAULT_LOCATION}
          />
        </Field>
      </Section>

      <Divider />

      {/* PRICING */}
      <Section title="Pricing & Size">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Entry Fee (USD)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.entry_fee}
              onChange={(e) => update("entry_fee", e.target.value)}
              className={inputCls("entry_fee")}
              placeholder="150.00"
            />
          </Field>
          <Field label="Max Teams">
            <input
              type="number"
              min="0"
              value={form.max_teams}
              onChange={(e) => update("max_teams", e.target.value)}
              className={inputCls("max_teams")}
              placeholder="16"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Toggle
            label="Offer guest / single-round tier on pay page"
            checked={form.offer_drop_in_tier}
            onChange={(v) => update("offer_drop_in_tier", v)}
          />
          {form.offer_drop_in_tier ? (
            <Field
              label="Drop-in / Guest Fee (USD)"
              error={errors.drop_in_fee}
              hint="Shown as the Guest tier on /pay alongside the Entry Fee."
            >
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.drop_in_fee}
                onChange={(e) => update("drop_in_fee", e.target.value)}
                className={inputCls("drop_in_fee")}
                placeholder="20.00"
              />
            </Field>
          ) : (
            <div className="flex items-center px-4 py-3 text-xs text-zinc-500 bg-surface-2/40 border border-dashed border-border-token rounded-lg">
              Only the Entry Fee tier will show on /pay for this event.
            </div>
          )}
        </div>
      </Section>

      <Divider />

      {/* BANNER IMAGE */}
      <Section title="Banner Image">
        <div className="flex gap-1 bg-surface-2 rounded-lg p-1 w-fit">
          <button
            type="button"
            onClick={() => setImageTab("upload")}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors ${
              imageTab === "upload" ? "bg-base text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Upload size={14} />
            Upload Image
          </button>
          <button
            type="button"
            onClick={() => setImageTab("preset")}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md transition-colors ${
              imageTab === "preset" ? "bg-base text-white" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <ImageIcon size={14} />
            Choose Preset
          </button>
        </div>

        {imageTab === "upload" && (
          <div className="space-y-3">
            <label
              htmlFor="tournament-image-file"
              className="flex flex-col items-center justify-center gap-2 px-4 py-8 border border-dashed border-border-token rounded-lg cursor-pointer bg-surface-2/40 hover:bg-surface-2 transition-colors"
            >
              {uploading ? (
                <Loader2 size={20} className="animate-spin text-brand" />
              ) : (
                <Upload size={20} className="text-brand" />
              )}
              <span className="text-sm text-zinc-300">
                {uploading ? "Uploading…" : "JPG, PNG, or WebP (max 5MB). Images are resized and saved as WebP."}
              </span>
            </label>
            <input
              id="tournament-image-file"
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
            {form.image_url && (
              <button
                type="button"
                onClick={() => void handleClearImage()}
                className="text-xs text-zinc-400 hover:text-white underline"
              >
                Clear uploaded image
              </button>
            )}
          </div>
        )}

        {imageTab === "preset" && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {TOURNAMENT_IMAGE_PRESETS.map((p) => {
              const selected = form.image_preset === p.key && !form.image_url;
              return (
                <button
                  type="button"
                  key={p.key}
                  onClick={() => {
                    update("image_preset", p.key);
                    update("image_url", null);
                  }}
                  className={`relative rounded-lg overflow-hidden border-2 transition-colors text-left ${
                    selected ? "border-brand" : "border-border-token hover:border-zinc-500"
                  }`}
                >
                  <div className="relative aspect-video bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
                    {selected && (
                      <div className="absolute top-2 right-2 bg-brand text-white rounded-full w-6 h-6 flex items-center justify-center">
                        <Check size={14} />
                      </div>
                    )}
                  </div>
                  <p className="px-2 py-2 text-xs text-zinc-300">{p.label}</p>
                </button>
              );
            })}
          </div>
        )}

        {previewUrl && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Preview</p>
            <p className="text-xs text-zinc-500">
              Same wide banner crop as the public event page (16:7).
            </p>
            <div className="relative w-full aspect-[16/7] max-h-72 rounded-lg overflow-hidden bg-surface-2 border border-border-token">
              <Image
                src={previewUrl}
                alt="Banner preview"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 896px"
              />
            </div>
          </div>
        )}
      </Section>

      <Divider />

      {/* ADVANCED — rarely touched; hidden so the everyday form stays short */}
      <section className="space-y-4">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          className="flex items-center gap-2 text-xs font-mono text-zinc-400 hover:text-white uppercase tracking-wider font-semibold transition-colors"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${advancedOpen ? "" : "-rotate-90"}`}
          />
          Advanced
        </button>
        {!advancedOpen && (
          <p className="text-xs text-zinc-500">
            Web address, link overrides and list order. You almost never need these.
          </p>
        )}
        {advancedOpen && (
          <div className="space-y-4 border-l-2 border-border-token/60 ml-1.5 pl-5">
            <Field
              label="Slug"
              required
              error={errors.slug}
              hint="The web address for this event: /events/[slug]. Filled in from the title."
            >
              <input
                type="text"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  update("slug", e.target.value);
                }}
                className={inputCls("slug")}
                placeholder="spring-classic-2026"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Register URL" hint="Leave blank to use /register">
                <input
                  type="text"
                  value={form.register_url}
                  onChange={(e) => update("register_url", e.target.value)}
                  className={inputCls("register_url")}
                  placeholder="/register"
                />
              </Field>
              <Field label="Pay URL" hint="Leave blank to use /pay">
                <input
                  type="text"
                  value={form.pay_url}
                  onChange={(e) => update("pay_url", e.target.value)}
                  className={inputCls("pay_url")}
                  placeholder="/pay"
                />
              </Field>
            </div>
            <Field label="Display Order" hint="Lower numbers shown first">
              <input
                type="number"
                value={form.display_order}
                onChange={(e) => update("display_order", e.target.value)}
                className={inputCls("display_order")}
              />
            </Field>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border-token">
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          {saving ? "Saving…" : "Save Tournament"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/tournaments")}
          className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-mono text-brand uppercase tracking-wider font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Divider() {
  return <div className="h-px bg-border-token/70" />;
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1">
        {label}
        {required && <span className="text-brand ml-1">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      {!error && hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

/**
 * "Show on homepage" (D1). Deliberately a star and not another switch — it is a
 * separate idea from the event's status, and it should not read as one of the
 * four states.
 */
function StarToggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  const on = checked && !disabled;
  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`flex w-full items-center gap-3 px-4 py-3 bg-surface-2 border rounded-lg transition-colors text-left ${
          on ? "border-brand" : "border-border-token"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-zinc-500"}`}
      >
        <Star
          size={18}
          className={on ? "text-brand fill-current" : "text-zinc-500"}
        />
        <span className="text-sm text-zinc-300">{label}</span>
      </button>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 px-4 py-3 bg-surface-2 border border-border-token rounded-lg cursor-pointer">
      <span className="text-sm text-zinc-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? "bg-brand" : "bg-zinc-600"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}
