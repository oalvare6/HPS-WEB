"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { Section, SectionHeader } from "@/components/shared/section";
import { CheckCircle, ArrowLeft } from "lucide-react";

export default function RegisterPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <>
      {/* Hero */}
      <section className="bg-zinc-950 text-white py-16 md:py-24 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Register for Tournament
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            Sign up for upcoming leagues and tournaments at Houston Premier Soccer.
          </p>
        </div>
      </section>

      {/* Registration Form */}
      <Section dark className="bg-zinc-900">
        <div className="max-w-2xl mx-auto">
          {submitted ? (
            <div className="dashboard-card p-8 md:p-12 text-center">
              <CheckCircle size={56} className="text-green-500 mx-auto mb-6" />
              <h2 className="text-2xl font-semibold text-white mb-3">
                Registration Received
              </h2>
              <p className="text-zinc-400 mb-6 max-w-md mx-auto">
                Thanks for registering. We&apos;ll send confirmation and next steps 
                to your email address.
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-green-500 font-medium hover:text-green-400 transition-colors"
              >
                <ArrowLeft size={18} />
                Back to Home
              </Link>
            </div>
          ) : (
            <>
              <SectionHeader
                title="Player Registration"
                subtitle="Fill out the form below to register for events."
                dark
              />

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Registration Type */}
                <div>
                  <label
                    htmlFor="type"
                    className="block text-sm font-medium text-zinc-300 mb-2"
                  >
                    Registration Type
                  </label>
                  <select
                    id="type"
                    name="type"
                    required
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                  >
                    <option value="">Select one...</option>
                    <option value="team">Team Registration</option>
                    <option value="adult">Adult Individual (18+)</option>
                    <option value="youth">Youth Player (Parent Registering)</option>
                    <option value="freeagent">Free Agent</option>
                  </select>
                </div>

                {/* Name Fields */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="firstName"
                      className="block text-sm font-medium text-zinc-300 mb-2"
                    >
                      First Name
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      name="firstName"
                      required
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors placeholder:text-zinc-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="lastName"
                      className="block text-sm font-medium text-zinc-300 mb-2"
                    >
                      Last Name
                    </label>
                    <input
                      type="text"
                      id="lastName"
                      name="lastName"
                      required
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors placeholder:text-zinc-500"
                    />
                  </div>
                </div>

                {/* Contact */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-zinc-300 mb-2"
                    >
                      Email
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors placeholder:text-zinc-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="phone"
                      className="block text-sm font-medium text-zinc-300 mb-2"
                    >
                      Phone
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      required
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors placeholder:text-zinc-500"
                    />
                  </div>
                </div>

                {/* Date of Birth */}
                <div>
                  <label
                    htmlFor="dob"
                    className="block text-sm font-medium text-zinc-300 mb-2"
                  >
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    id="dob"
                    name="dob"
                    required
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                  />
                </div>

                {/* Emergency Contact */}
                <div className="pt-4 border-t border-zinc-800">
                  <h3 className="text-sm font-medium text-zinc-300 mb-4">
                    Emergency Contact
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="emergencyName"
                        className="block text-sm font-medium text-zinc-400 mb-2"
                      >
                        Contact Name
                      </label>
                      <input
                        type="text"
                        id="emergencyName"
                        name="emergencyName"
                        required
                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors placeholder:text-zinc-500"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="emergencyPhone"
                        className="block text-sm font-medium text-zinc-400 mb-2"
                      >
                        Contact Phone
                      </label>
                      <input
                        type="tel"
                        id="emergencyPhone"
                        name="emergencyPhone"
                        required
                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors placeholder:text-zinc-500"
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
                      className="w-5 h-5 mt-0.5 border-zinc-600 bg-zinc-800 rounded focus:ring-green-500 text-green-500"
                    />
                    <span className="text-sm text-zinc-400">
                      I agree to the waiver and terms of participation. I understand that 
                      soccer is a physical activity with inherent risks.
                    </span>
                  </label>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="w-full btn-primary h-12"
                >
                  Submit Registration
                </button>

                <p className="text-sm text-zinc-500 text-center">
                  After submitting, you&apos;ll receive confirmation and payment details via email.
                </p>
              </form>
            </>
          )}
        </div>
      </Section>

      {/* Bottom padding for mobile fixed bar */}
      <div className="h-20 md:hidden bg-zinc-900" />
    </>
  );
}
