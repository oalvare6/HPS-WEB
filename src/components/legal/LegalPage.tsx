import Link from "next/link";
import { Section } from "@/components/shared/section";

/**
 * Shared shell for the four legal pages (A5 / D10).
 *
 * They are deliberately plain: short sentences, no defined-term games, and
 * headings a player can scan. The audience is someone deciding whether to hand
 * over their phone number and their kid's date of birth, not a court.
 */
export function LegalPage({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro: string;
  /** Human-readable effective date, e.g. "August 12, 2026". */
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <section className="bg-base text-white py-14 md:py-20 bg-tactical-grid">
        <div className="max-w-3xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            {title}
          </h1>
          <p className="text-lg text-zinc-400">{intro}</p>
          <p className="mt-4 text-sm text-zinc-500">Last updated {updated}</p>
        </div>
      </section>

      <Section dark className="bg-surface" container={false}>
        <div className="max-w-3xl mx-auto px-6">
          <div className="space-y-8 text-zinc-300 leading-relaxed">{children}</div>

          <div className="mt-12 pt-8 border-t border-border-token flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <LegalNavLink href="/privacy" label="Privacy" />
            <LegalNavLink href="/terms" label="Terms" />
            <LegalNavLink href="/refunds" label="Refunds" />
            <LegalNavLink href="/cookies" label="Cookies" />
            <LegalNavLink href="/contact" label="Contact us" />
          </div>
        </div>
      </Section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}

function LegalNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-zinc-400 hover:text-white transition-colors"
    >
      {label}
    </Link>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{heading}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 list-disc pl-5 marker:text-zinc-600">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
