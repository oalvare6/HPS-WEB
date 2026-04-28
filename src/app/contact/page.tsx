"use client";

import { useState, FormEvent } from "react";
import { Section, SectionHeader } from "@/components/shared/section";
import { LocationInline } from "@/components/shared/location-card";
import { Mail, CheckCircle, Clock } from "lucide-react";

const WHATSAPP_URL = "https://chat.whatsapp.com/HzBW39TgVemIA6EHWMnInY";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M24 4C13 4 4 13 4 24c0 3.6 1 7 2.7 10L4 44l10.3-2.7C17.2 43 20.5 44 24 44c11 0 20-9 20-20S35 4 24 4zm0 36c-3.1 0-6.1-.8-8.7-2.4l-.6-.4-6.1 1.6 1.6-5.9-.4-.6C8.2 30.3 7.4 27.2 7.4 24 7.4 14.8 14.9 7.4 24 7.4S40.6 14.9 40.6 24 33.1 40 24 40zm10.9-14.5c-.6-.3-3.5-1.7-4-1.9-.5-.2-.9-.3-1.3.3-.4.6-1.5 1.9-1.8 2.3-.3.4-.7.4-1.3.1-.6-.3-2.5-.9-4.7-2.9-1.7-1.5-2.9-3.4-3.2-4-.3-.6 0-.9.3-1.2.3-.3.6-.7.9-1 .3-.3.4-.6.6-1 .2-.4.1-.7 0-1-.1-.3-1.3-3.2-1.8-4.3-.5-1.1-1-1-1.3-1H16c-.4 0-1 .1-1.5.7-.5.6-2 1.9-2 4.7s2 5.5 2.3 5.8c.3.4 4 6.1 9.7 8.6 1.4.6 2.4.9 3.3 1.2 1.4.4 2.6.4 3.6.2 1.1-.2 3.5-1.4 4-2.8.5-1.4.5-2.5.3-2.8-.1-.2-.5-.4-1.1-.6z" />
    </svg>
  );
}

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <>
      {/* Hero */}
      <section className="bg-base text-white py-16 md:py-24 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Get in Touch
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            Questions about events, facility rentals, or registration? 
            Reach out and we&apos;ll get back to you.
          </p>
        </div>
      </section>

      {/* Contact Content */}
      <Section dark className="bg-surface">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-16">
          {/* Form */}
          <div>
            <SectionHeader
              title="Send a Message"
              dark
            />

            {submitted ? (
              <div className="dashboard-card p-8 text-center">
                <CheckCircle size={48} className="text-white mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  Message Sent
                </h3>
                <p className="text-zinc-400">
                  Thanks for reaching out. We&apos;ll get back to you soon.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-zinc-300 mb-2"
                  >
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
                    className="w-full px-4 py-3 bg-surface-2 border border-border-token text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-colors placeholder:text-zinc-500"
                    placeholder="your@email.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="subject"
                    className="block text-sm font-medium text-zinc-300 mb-2"
                  >
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
                  <label
                    htmlFor="message"
                    className="block text-sm font-medium text-zinc-300 mb-2"
                  >
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

                <button
                  type="submit"
                  className="w-full btn-primary h-12"
                >
                  Send Message
                </button>
              </form>
            )}
          </div>

          {/* Contact Info */}
          <div>
            <SectionHeader
              title="Contact Info"
              dark
            />

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

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-[#25D366] rounded-lg flex items-center justify-center flex-shrink-0">
                  <WhatsAppIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-medium text-white">WhatsApp Community</h3>
                  <a
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#25D366] hover:text-[#20bd5a] transition-colors"
                  >
                    Join our community chat
                  </a>
                </div>
              </div>

              {/* Location */}
              <LocationInline />
            </div>

            {/* Hours Note */}
            <div className="dashboard-card mt-8 p-6">
              <div className="flex items-start gap-3">
                <Clock size={20} className="text-white flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-white mb-2">Response Time</h3>
                  <p className="text-zinc-400 text-sm">
                    We typically respond within 24-48 hours. For urgent matters, 
                    please call during business hours (9 AM - 6 PM).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Bottom padding for mobile fixed bar */}
      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}
