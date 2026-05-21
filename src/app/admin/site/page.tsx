"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Save,
  RefreshCw,
  Plus,
  Trash2,
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { Section } from "@/components/shared/section";
import { FormFieldsSkeleton } from "@/components/shared/skeleton";
import {
  SITE_SETTING_KEYS,
  STATUS_PILL_VALUES,
  type SiteSettingKey,
  type SiteSettingValue,
  type StatusPill,
  type StatusPillValue,
} from "@/lib/site-settings";

type SettingsMap = { [K in SiteSettingKey]: SiteSettingValue<K> };
type MetaMap = { [K in SiteSettingKey]: { description: string } };

const SETTING_LABELS: Record<SiteSettingKey, string> = {
  "home.status_pills": "Home page — status pills",
  "footer.address": "Footer — address",
  "footer.maps_url": "Footer — Google Maps directions URL",
  "footer.whatsapp_url": "Footer — WhatsApp invite URL",
  "contact.email": "Contact — public email",
  "contact.phone": "Contact — public phone (optional)",
};

const inputCls =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors";

export default function AdminSitePage() {
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [meta, setMeta] = useState<MetaMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<SiteSettingKey | null>(null);
  const [dirtyKeys, setDirtyKeys] = useState<Set<SiteSettingKey>>(new Set());

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/site-settings");
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load site settings.");
        return;
      }
      setSettings(data.settings);
      setMeta(data.meta);
      setDirtyKeys(new Set());
    } catch {
      setError("Failed to load site settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateSetting = <K extends SiteSettingKey>(
    key: K,
    value: SiteSettingValue<K>
  ) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setDirtyKeys((prev) => new Set(prev).add(key));
  };

  const saveSetting = async <K extends SiteSettingKey>(key: K) => {
    if (!settings) return;
    setSavingKey(key);
    try {
      const res = await fetch("/api/admin/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: settings[key] }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed.");
        return;
      }
      toast.success(`${SETTING_LABELS[key]} saved.`);
      setDirtyKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } catch {
      toast.error("Save failed.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Site settings</h1>
            <p className="text-zinc-400">
              Edit shared text and links that appear on the public site. Changes go live within ~1 minute.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white border border-border-token rounded-lg px-3 py-1.5 transition-colors"
          >
            <RefreshCw size={14} />
            Reload
          </button>
        </div>
      </section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-3xl mx-auto px-6 space-y-6">
          {loading ? (
            <FormFieldsSkeleton fields={SITE_SETTING_KEYS.length} />
          ) : error ? (
            <p className="text-red-400">{error}</p>
          ) : (
            settings &&
            meta &&
            SITE_SETTING_KEYS.map((key) => {
              const dirty = dirtyKeys.has(key);
              const saving = savingKey === key;
              return (
                <div key={key} className="dashboard-card p-5 md:p-6 space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-white">{SETTING_LABELS[key]}</h3>
                    <p className="text-xs text-zinc-500 mt-1">{meta[key].description}</p>
                  </div>

                  {key === "home.status_pills" ? (
                    <StatusPillsEditor
                      value={settings[key] as StatusPill[]}
                      onChange={(v) => updateSetting(key, v as SiteSettingValue<typeof key>)}
                    />
                  ) : (
                    <input
                      type={
                        key === "footer.maps_url" || key === "footer.whatsapp_url"
                          ? "url"
                          : key === "contact.email"
                            ? "email"
                            : "text"
                      }
                      value={(settings[key] as string) ?? ""}
                      onChange={(e) =>
                        updateSetting(key, e.target.value as SiteSettingValue<typeof key>)
                      }
                      placeholder={
                        key === "contact.phone"
                          ? "Optional — leave blank to hide"
                          : undefined
                      }
                      className={inputCls}
                    />
                  )}

                  <div className="flex items-center justify-end gap-3">
                    {dirty && <span className="text-xs text-yellow-400">Unsaved changes</span>}
                    <button
                      type="button"
                      disabled={!dirty || saving}
                      onClick={() => saveSetting(key)}
                      className="inline-flex items-center gap-2 btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Section>
    </>
  );
}

function StatusPillsEditor({
  value,
  onChange,
}: {
  value: StatusPill[];
  onChange: (next: StatusPill[]) => void;
}) {
  const update = (idx: number, patch: Partial<StatusPill>) => {
    const next = value.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onChange(next);
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const add = () => {
    if (value.length >= 6) return;
    onChange([...value, { label: "New status", status: "open" }]);
  };

  return (
    <div className="space-y-3">
      {value.map((pill, i) => (
        <div key={i} className="flex items-center gap-2">
          <GripVertical size={14} className="text-zinc-600 flex-shrink-0" />
          <input
            type="text"
            value={pill.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Label"
            className={`${inputCls} !py-2 flex-1`}
          />
          <select
            value={pill.status}
            onChange={(e) => update(i, { status: e.target.value as StatusPillValue })}
            className={`${inputCls} !py-2 w-32`}
          >
            {STATUS_PILL_VALUES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => remove(i)}
            disabled={value.length <= 1}
            className="text-zinc-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed p-2"
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={value.length >= 6}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white disabled:opacity-50"
      >
        <Plus size={14} />
        Add status
      </button>
      <p className="text-xs text-zinc-500">1–6 entries. At least one is required.</p>
    </div>
  );
}
