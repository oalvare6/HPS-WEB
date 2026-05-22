import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Section } from "@/components/shared/section";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SecurityForm } from "./SecurityForm";

export const dynamic = "force-dynamic";

/**
 * Account security: set or change the player's Supabase Auth password.
 *
 * Whether the user already has a password is tracked in
 * `user.user_metadata.has_password`, written by every successful in-app
 * password write (this form and `/auth/reset`). Phase 11 is the first
 * surface to write passwords in-app, so existing magic-link-only accounts
 * correctly read as `hasPassword: false` until they set one here.
 */
export default async function SecurityPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    redirect("/login?next=/me/security");
  }

  const email = user.email;
  const meta = (user.user_metadata ?? {}) as { has_password?: boolean };
  const hasPassword = Boolean(meta.has_password);

  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-3xl mx-auto px-6">
          <Link
            href="/me"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4"
          >
            <ArrowLeft size={14} />
            Back to my account
          </Link>
          <p className="text-xs uppercase tracking-wider text-brand mb-2">
            Account security
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            {hasPassword ? "Change password" : "Set a password"}
          </h1>
          <p className="text-zinc-400 text-sm">
            {hasPassword
              ? "Update the password for your sign-in email."
              : "Add a password so you can sign in without waiting for a magic-link email."}
          </p>
        </div>
      </section>

      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <div className="max-w-3xl mx-auto px-6 space-y-6">
          <div className="dashboard-card p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                Signed in as {email}
              </h2>
              <p className="text-sm text-zinc-400 mt-1">
                Magic-link sign-in keeps working either way. Setting a
                password is optional and just gives you a faster way back in.
              </p>
            </div>
          </div>

          <SecurityForm email={email} hasPassword={hasPassword} />
        </div>
      </Section>

      <div className="h-20 md:hidden bg-surface" />
    </>
  );
}
