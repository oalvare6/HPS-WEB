"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Upload, Image as ImageIcon, Check } from "lucide-react";
import { toast } from "sonner";
import {
  TOURNAMENT_FORMATS,
  TOURNAMENT_STATUSES,
  type Tournament,
  type TournamentStatus,
} from "@/lib/types";
import { TOURNAMENT_IMAGE_PRESETS, getPresetUrl } from "@/lib/tournament-image-presets";
import { slugify } from "@/lib/slug";

const DEFAULT_LOCATION = "14062 Ambrose St, Houston TX";

type FormState = {
  title: string;
  slug: string;
  format: string;
  description: string;
  status: TournamentStatus;
  start_date: string;
  end_date: string;
  recurrence: string;
  time_start: string;
  time_end: string;
  location: string;
  registration_open: boolean;
  payments_open: boolean;
  entry_fee: string;
  max_teams: string;
  register_url: string;
  pay_url: string;
  image_url: string | null;
  image_preset: string | null;
  display_order: string;
};

function toDateInput(value: string | null): string {
  if (!value) return "";
  // Slice YYYY-MM-DD from ISO string
  return value.slice(0, 10);
}

function fromInitial(t: Tournament | null): FormState {
  return {
    title: t?.title ?? "",
    slug: t?.slug ?? "",
    format: t?.format ?? "Adult 7v7",
    description: t?.description ?? "",
    status: (t?.status ?? "upcoming") as TournamentStatus,
    start_date: toDateInput(t?.start_date ?? null),
    end_date: toDateInput(t?.end_date ?? null),
    recurrence: t?.recurrence ?? "",
    time_start: t?.time_start ?? "",
    time_end: t?.time_end ?? "",
    location: t?.location ?? DEFAULT_LOCATION,
    registration_open: t?.registration_open ?? false,
    payments_open: t?.payments_open ?? false,
    entry_fee: t?.entry_fee != null ? String(t.entry_fee) : "",
    max_teams: t?.max_teams != null ? String(t.max_teams) : "",
    register_url: t?.register_url ?? "",
    pay_url: t?.pay_url ?? "",
    image_url: t?.image_url ?? null,
    image_preset: t?.image_preset ?? null,
    display_order: t?.display_order != null ? String(t.display_order) : "0",
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

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "Title is required.";
    if (!form.slug.trim()) e.slug = "Slug is required.";
    if (!form.format.trim()) e.format = "Format is required.";
    if (!form.status) e.status = "Status is required.";
    if (!form.start_date) e.start_date = "Start date is required.";
    if (!form.time_start.trim()) e.time_start = "Start time is required.";
    if (!form.time_end.trim()) e.time_end = "End time is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
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
      toast.success("Image uploaded.");
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
    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      format: form.format,
      description: form.description.trim() || null,
      status: form.status,
      start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      recurrence: form.recurrence.trim() || null,
      time_start: form.time_start.trim(),
      time_end: form.time_end.trim(),
      location: form.location.trim() || null,
      registration_open: form.registration_open,
      payments_open: form.payments_open,
      entry_fee: form.entry_fee.trim() ? Number(form.entry_fee) : null,
      max_teams: form.max_teams.trim() ? Number(form.max_teams) : null,
      register_url: form.register_url.trim() || null,
      pay_url: form.pay_url.trim() || null,
      image_url: form.image_url,
      image_preset: form.image_preset,
      display_order: form.display_order.trim() ? Number(form.display_order) : 0,
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
        <Field
          label="Slug"
          required
          error={errors.slug}
          hint={`URL preview: /events/${form.slug || "your-tournament"}`}
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
        <Field label="Status" required error={errors.status}>
          <select
            value={form.status}
            onChange={(e) => update("status", e.target.value as TournamentStatus)}
            className={inputCls("status")}
          >
            {TOURNAMENT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
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

      {/* REGISTRATION */}
      <Section title="Registration">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Toggle
            label="Registration Open"
            checked={form.registration_open}
            onChange={(v) => update("registration_open", v)}
          />
          <Toggle
            label="Payments Open"
            checked={form.payments_open}
            onChange={(v) => update("payments_open", v)}
          />
        </div>
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
          <Field label="Register URL">
            <input
              type="text"
              value={form.register_url}
              onChange={(e) => update("register_url", e.target.value)}
              className={inputCls("register_url")}
              placeholder="/register"
            />
          </Field>
          <Field label="Pay URL">
            <input
              type="text"
              value={form.pay_url}
              onChange={(e) => update("pay_url", e.target.value)}
              className={inputCls("pay_url")}
              placeholder="/pay"
            />
          </Field>
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
                {uploading ? "Uploading…" : "Click to upload JPG, PNG, or WebP (max 5MB)"}
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
                onClick={() => update("image_url", null)}
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
            <div className="relative w-full h-40 rounded-lg overflow-hidden bg-surface-2 border border-border-token">
              <Image src={previewUrl} alt="Preview" fill className="object-cover" unoptimized />
            </div>
          </div>
        )}
      </Section>

      <Divider />

      {/* DISPLAY */}
      <Section title="Display">
        <Field label="Display Order" hint="Lower numbers shown first">
          <input
            type="number"
            value={form.display_order}
            onChange={(e) => update("display_order", e.target.value)}
            className={inputCls("display_order")}
          />
        </Field>
      </Section>

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
