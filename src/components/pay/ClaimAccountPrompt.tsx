import { UserPlus } from "lucide-react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

/**
 * Post-checkout account offer, shown to a payer who is signed out.
 *
 * This replaces the old `ClaimAccountForm`, which emailed a magic link. That
 * link was the only way to redeem the account it created, so once sign-in
 * became Google/Apple only (D5) it would have produced accounts nobody could
 * ever open again — the shape of the problem already in production, where 28
 * accounts exist and 5 have ever been used.
 *
 * The email is shown, not collected: Stripe already verified it, and it is the
 * address the player should use with Google or Apple so Supabase links them to
 * the same person rather than making a second one.
 */
export function ClaimAccountPrompt({ email }: { email: string }) {
  return (
    <div className="dashboard-card p-6 space-y-5">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center mx-auto">
          <UserPlus size={18} />
        </div>
        <h3 className="text-lg font-semibold text-white">
          Set up your account
        </h3>
        <p className="text-sm text-zinc-400">
          Next time, sign in and skip the form entirely — your waiver and
          details will already be there.
        </p>
      </div>

      <OAuthButtons nextPath="/me" />

      <p className="text-xs text-zinc-500 text-center">
        Use <span className="font-mono text-zinc-400">{email}</span> — the
        address on this payment — so we connect it to the registration you just
        paid for.
      </p>
    </div>
  );
}
