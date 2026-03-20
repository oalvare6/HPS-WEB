"use client";

import { useState, FormEvent } from "react";
import { Section, SectionHeader } from "@/components/shared/section";
import { User, Mail, CalendarDays, ShieldAlert } from "lucide-react";

type RegistrationType = "adult" | "youth" | "";

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function RegisterPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [phone, setPhone] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    setSubmitError("");
    setIsSubmitting(true);

    const payload = {
      type: String(formData.get("type") || ""),
      firstName: String(formData.get("firstName") || ""),
      lastName: String(formData.get("lastName") || ""),
      email: String(formData.get("email") || ""),
      phone: String(formData.get("phone") || ""),
      dob: String(formData.get("dob") || ""),
      emergencyName: String(formData.get("emergencyName") || ""),
      emergencyPhone: String(formData.get("emergencyPhone") || ""),
    };

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        error?: string;
        signUrl?: string;
      };

      if (!response.ok) {
        setSubmitError(
          data.error || "We couldn't save your registration right now. Please try again."
        );
        return;
      }

      if (data.signUrl) {
        window.location.href = data.signUrl;
      } else {
        setSubmitError(
          "Registration saved, but we couldn't load the waiver. Please contact us."
        );
      }
    } catch {
      setSubmitError("We couldn't save your registration right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-colors placeholder:text-zinc-500";

  return (
    <>
      {/* Hero */}
      <section className="bg-zinc-950 text-white py-16 md:py-24 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Register for 7v7 Tournament
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            Sign up for upcoming 7v7 leagues and tournaments at Houston Premier Soccer.
          </p>
        </div>
      </section>

      {/* Registration Form */}
      <Section dark className="bg-zinc-900">
        <div className="max-w-2xl mx-auto">
          <SectionHeader
            title="Player Registration"
            subtitle="Fill out the form below to register. You'll sign the waiver on the next page."
            dark
          />

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Registration Type */}
            <div className="space-y-2">
              <label
                htmlFor="type"
                className="block text-sm font-semibold text-zinc-200"
              >
                Registration Type <span className="text-red-400">*</span>
              </label>
              <select
                id="type"
                name="type"
                required
                defaultValue=""
                className={inputClass}
              >
                <option value="" disabled>
                  Select one...
                </option>
                <option value="adult">Adult (18+)</option>
                <option value="youth">Youth (parent/guardian registering)</option>
              </select>
              <p className="text-xs text-zinc-500">
                Adults sign the adult waiver. Youth registrations use the youth waiver (signed by a parent or guardian).
              </p>
            </div>

            {/* Name Fields */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <User size={16} className="text-green-500" />
                <span className="text-sm font-semibold text-zinc-200">
                  Full Name <span className="text-red-400">*</span>
                </span>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    required
                    autoComplete="given-name"
                    autoCapitalize="words"
                    placeholder="First name"
                    className={inputClass}
                  />
                </div>
                <div>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    required
                    autoComplete="family-name"
                    autoCapitalize="words"
                    placeholder="Last name"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Mail size={16} className="text-green-500" />
                <span className="text-sm font-semibold text-zinc-200">
                  Contact Info <span className="text-red-400">*</span>
                </span>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-medium text-zinc-400 mb-1.5"
                  >
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="phone"
                    className="block text-xs font-medium text-zinc-400 mb-1.5"
                  >
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    required
                    autoComplete="tel"
                    placeholder="(555) 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Date of Birth */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CalendarDays size={16} className="text-green-500" />
                <label
                  htmlFor="dob"
                  className="text-sm font-semibold text-zinc-200"
                >
                  Date of Birth <span className="text-red-400">*</span>
                </label>
              </div>
              <input
                type="date"
                id="dob"
                name="dob"
                required
                max={new Date().toISOString().split("T")[0]}
                className={`${inputClass} md:max-w-xs`}
              />
              <p className="text-xs text-zinc-500">
                Must be 18+ for adult registration. Youth players must have a parent or guardian register.
              </p>
            </div>

            {/* Emergency Contact */}
            <div className="space-y-4 pt-4 border-t border-zinc-800">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className="text-yellow-500" />
                <span className="text-sm font-semibold text-zinc-200">
                  Emergency Contact <span className="text-red-400">*</span>
                </span>
              </div>
              <p className="text-xs text-zinc-500 -mt-2">
                Someone we can reach in case of an emergency during the event.
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="emergencyName"
                    className="block text-xs font-medium text-zinc-400 mb-1.5"
                  >
                    Contact Full Name
                  </label>
                  <input
                    type="text"
                    id="emergencyName"
                    name="emergencyName"
                    required
                    autoCapitalize="words"
                    placeholder="Jane Doe"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="emergencyPhone"
                    className="block text-xs font-medium text-zinc-400 mb-1.5"
                  >
                    Contact Phone Number
                  </label>
                  <input
                    type="tel"
                    id="emergencyPhone"
                    name="emergencyPhone"
                    required
                    placeholder="(555) 123-4567"
                    value={emergencyPhone}
                    onChange={(e) =>
                      setEmergencyPhone(formatPhone(e.target.value))
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {/* Waiver Agreement */}
            <div className="pt-4 border-t border-zinc-800">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="waiver"
                  required
                  className="w-5 h-5 mt-0.5 border-zinc-600 bg-zinc-800 rounded focus:ring-green-500 text-green-600"
                />
                <span className="text-sm text-zinc-400">
                  I agree to the waiver and terms of participation. I understand
                  that soccer is a physical activity with inherent risks.
                </span>
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full btn-primary h-12 disabled:opacity-70 disabled:cursor-not-allowed"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving Registration..." : "Submit Registration"}
            </button>

            {submitError && (
              <p className="text-sm text-red-400 text-center">{submitError}</p>
            )}

            <p className="text-sm text-zinc-500 text-center">
              After submitting, you&apos;ll be directed to sign the waiver.
              Registration is not complete until the waiver is signed.
            </p>
          </form>
        </div>
      </Section>

      {/* Bottom padding for mobile fixed bar */}
      <div className="h-20 md:hidden bg-zinc-900" />
    </>
  );
}
