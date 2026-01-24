"use client";

import { useState, FormEvent } from "react";
import { Section, SectionHeader } from "@/components/shared/section";
import { Mail, Phone, MapPin, CheckCircle } from "lucide-react";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <>
      {/* Hero */}
      <section className="bg-zinc-950 text-white py-20 md:py-28">
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
      <Section>
        <div className="grid md:grid-cols-2 gap-12 lg:gap-16">
          {/* Form */}
          <div>
            <SectionHeader
              title="Send a Message"
            />

            {submitted ? (
              <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-8 text-center">
                <CheckCircle size={48} className="text-zinc-700 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-zinc-900 mb-2">
                  Message Sent
                </h3>
                <p className="text-zinc-600">
                  Thanks for reaching out. We&apos;ll get back to you soon.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-zinc-900 mb-2"
                  >
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    className="w-full px-4 py-3 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-colors"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-zinc-900 mb-2"
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    className="w-full px-4 py-3 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-colors"
                    placeholder="your@email.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="message"
                    className="block text-sm font-medium text-zinc-900 mb-2"
                  >
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    required
                    className="w-full px-4 py-3 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-colors resize-none"
                    placeholder="How can we help?"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-zinc-900 text-white py-3 px-6 font-medium rounded-md hover:bg-zinc-800 transition-colors"
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
            />

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Mail size={20} className="text-zinc-600" />
                </div>
                <div>
                  <h3 className="font-medium text-zinc-900">Email</h3>
                  <a
                    href="mailto:info@houstonpremiersoccer.com"
                    className="text-zinc-600 hover:text-zinc-900 transition-colors"
                  >
                    info@houstonpremiersoccer.com
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Phone size={20} className="text-zinc-600" />
                </div>
                <div>
                  <h3 className="font-medium text-zinc-900">Phone</h3>
                  <a
                    href="tel:+17135550100"
                    className="text-zinc-600 hover:text-zinc-900 transition-colors"
                  >
                    (713) 555-0100
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <MapPin size={20} className="text-zinc-600" />
                </div>
                <div>
                  <h3 className="font-medium text-zinc-900">Location</h3>
                  <p className="text-zinc-600">Houston, TX</p>
                  <p className="text-zinc-500 text-sm">Full address coming soon</p>
                </div>
              </div>
            </div>

            {/* Hours Note */}
            <div className="mt-8 p-6 bg-zinc-50 rounded-lg">
              <h3 className="font-medium text-zinc-900 mb-2">Response Time</h3>
              <p className="text-zinc-600 text-sm">
                We typically respond within 24-48 hours. For urgent matters, 
                please call during business hours.
              </p>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
