import Link from "next/link";
import { Section, SectionHeader } from "@/components/shared/section";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";

/**
 * Forgot-password entry point. Always reachable, even for logged-in users
 * (they can still kick off a reset by email if they want a clean slate).
 *
 * The reset link in the email points back through `/auth/callback?next=/auth/reset`
 * so the existing PKCE exchange handles session minting before we show the
 * "set a new password" form.
 */
export default function ForgotPasswordPage() {
  return (
    <>
      <section className="bg-base text-white py-16 md:py-24 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Reset your password
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            Enter your email and we&apos;ll send a link to set a new password.
            The link is single-use and expires shortly.
          </p>
        </div>
      </section>

      <Section dark className="bg-surface">
        <div className="max-w-md mx-auto">
          <SectionHeader
            title="Forgot password"
            subtitle="We'll email a link that lets you choose a new password."
            dark
          />
          <ForgotPasswordForm />
          <p className="mt-8 text-sm text-zinc-500 text-center">
            Remembered it?{" "}
            <Link href="/login?tab=password" className="text-brand hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </Section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}
