import { redirect } from "next/navigation";
import { Section, SectionHeader } from "@/components/shared/section";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";

/**
 * Landing page for the password-recovery email link.
 *
 * The user reaches here after `/auth/callback` has already exchanged the
 * recovery code for a session, so a Supabase session must exist. If it
 * doesn't, the link is stale or was never minted — bounce them back to
 * `/login` with a recoverable error.
 */
export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=recovery_expired");
  }

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs uppercase tracking-wider text-brand mb-2">
            Account recovery
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            Set a new password
          </h1>
          <p className="text-zinc-400 text-base max-w-2xl">
            Choose a new password for{" "}
            <span className="text-white font-medium">{user.email}</span>. After
            you save it, you&apos;ll stay signed in.
          </p>
        </div>
      </section>

      <Section dark className="bg-surface">
        <div className="max-w-md mx-auto">
          <SectionHeader
            title="New password"
            subtitle="Pick something at least 8 characters long."
            dark
          />
          <ResetPasswordForm />
        </div>
      </Section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}
