"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

type ProfileValues = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  dob: string;
  emergency_name: string;
  emergency_phone: string;
};

const inputClass =
  "w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-colors placeholder:text-zinc-500 disabled:opacity-60 disabled:cursor-not-allowed";

const labelClass = "block text-xs font-medium text-zinc-400 mb-1.5";

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function MeProfileForm({
  initialContact,
}: {
  initialContact: ProfileValues;
}) {
  const [values, setValues] = useState<ProfileValues>(initialContact);
  const [savedSnapshot, setSavedSnapshot] = useState<ProfileValues>(initialContact);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const isDirty =
    values.first_name !== savedSnapshot.first_name ||
    values.last_name !== savedSnapshot.last_name ||
    values.phone !== savedSnapshot.phone ||
    values.dob !== savedSnapshot.dob ||
    values.emergency_name !== savedSnapshot.emergency_name ||
    values.emergency_phone !== savedSnapshot.emergency_phone;

  const update = (patch: Partial<ProfileValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setSaved(false);
    setError("");
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isDirty) return;
    setSubmitting(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: values.first_name,
          last_name: values.last_name,
          phone: values.phone,
          dob: values.dob,
          emergency_name: values.emergency_name,
          emergency_phone: values.emergency_phone,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error || "We couldn't save your changes. Please try again.");
        return;
      }
      setSavedSnapshot(values);
      setSaved(true);
    } catch {
      setError("We couldn't save your changes. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="dashboard-card p-5 md:p-6 space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="first_name" className={labelClass}>
            First name
          </label>
          <input
            id="first_name"
            type="text"
            autoComplete="given-name"
            autoCapitalize="words"
            value={values.first_name}
            onChange={(e) => update({ first_name: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="last_name" className={labelClass}>
            Last name
          </label>
          <input
            id="last_name"
            type="text"
            autoComplete="family-name"
            autoCapitalize="words"
            value={values.last_name}
            onChange={(e) => update({ last_name: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="email" className={labelClass}>
          Email{" "}
          <span className="text-zinc-500 font-normal">
            (your sign-in identity — can&apos;t be changed here)
          </span>
        </label>
        <input
          id="email"
          type="email"
          value={values.email}
          readOnly
          disabled
          className={inputClass}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="(555) 123-4567"
            value={values.phone}
            onChange={(e) => update({ phone: formatPhone(e.target.value) })}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="dob" className={labelClass}>
            Date of birth
          </label>
          <input
            id="dob"
            type="date"
            value={values.dob}
            max={new Date().toISOString().split("T")[0]}
            onChange={(e) => update({ dob: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>

      <fieldset className="pt-4 border-t border-border-token space-y-4">
        <legend className="text-sm font-semibold text-zinc-200 mb-2">
          Emergency contact
        </legend>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="emergency_name" className={labelClass}>
              Name
            </label>
            <input
              id="emergency_name"
              type="text"
              autoCapitalize="words"
              placeholder="First and last name"
              value={values.emergency_name}
              onChange={(e) => update({ emergency_name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="emergency_phone" className={labelClass}>
              Phone
            </label>
            <input
              id="emergency_phone"
              type="tel"
              placeholder="(555) 123-4567"
              value={values.emergency_phone}
              onChange={(e) =>
                update({ emergency_phone: formatPhone(e.target.value) })
              }
              className={inputClass}
            />
          </div>
        </div>
      </fieldset>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={!isDirty || submitting}
          className="btn-primary h-11 px-5 inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          {submitting ? "Saving..." : "Save changes"}
        </button>
        {saved && !isDirty && (
          <span className="inline-flex items-center gap-1.5 text-sm text-brand">
            <CheckCircle2 size={14} /> Saved
          </span>
        )}
        {error && (
          <span className="text-sm text-red-400" role="alert">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
