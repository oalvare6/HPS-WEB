"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Section, SectionHeader } from "@/components/shared/section";
import { LocationInline } from "@/components/shared/location-card";
import { Mail, CheckCircle, Clock } from "lucide-react";

export function ContactPageClient({
  whatsAppSlot,
}: {
  whatsAppSlot: ReactNode;
}) {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <>
      <section className="bg-base text-white py-16 md:py-24 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Get in Touch
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            Questions about events, facility rentals, or registration? Reach out and we&apos;ll
            get back to you.
          </p>
        </div>
      </section>

      <Section dark className="bg-surface">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-16">
          <div>
            <SectionHeader title="Send a Message" dark />

            {submitted ? (
              <div className="dashboard-card p-8 text-center">
                <CheckCircle size={48} className="text-white mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Message Sent</h3>
                <p className="text-zinc-400">
                  Thanks for reaching out. We&apos;ll get back to you soon.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-zinc-300 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    className="w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors placeholder:text-zinc-500"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    className="w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors placeholder:text-zinc-500"
                    placeholder="your@email.com"
                  />
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-zinc-300 mb-2">
                    Subject
                  </label>
                  <select
                    id="subject"
                    name="subject"
                    className="w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors"
                  >
                    <option value="general">General Inquiry</option>
                    <option value="registration">Tournament Registration</option>
                    <option value="league">League Information</option>
                    <option value="rental">Field Rental</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-zinc-300 mb-2">
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    required
                    className="w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors resize-none placeholder:text-zinc-500"
                    placeholder="How can we help?"
                  />
                </div>

                <button type="submit" className="w-full btn-primary h-12">
                  Send Message
                </button>
              </form>
            )}
          </div>

          <div>
            <SectionHeader title="Contact Info" dark />

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-surface-2 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Mail size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Email</h3>
                  <a
                    href="mailto:houspremiersoccer@gmail.com"
                    className="text-zinc-400 hover:text-white transition-colors"
                  >
                    houspremiersoccer@gmail.com
                  </a>
                </div>
              </div>

              {whatsAppSlot}

              <LocationInline />
            </div>

            <div className="dashboard-card mt-8 p-6">
              <div className="flex items-start gap-3">
                <Clock size={20} className="text-white flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-white mb-2">Response Time</h3>
                  <p className="text-zinc-400 text-sm">
                    We typically respond within 24-48 hours. For urgent matters, please call
                    during business hours (9 AM - 6 PM).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}
