/**
 * Throwaway helper: mint a local pay-resume link so the /pay gate can be
 * exercised in dev. Tokens are signed with the LOCAL secret, so these links
 * only work against localhost — production rejects them.
 *
 * Run: npx tsx --env-file=.env.local scripts/_mint-pay-token.ts <registrationId>
 */
import { createPayResumeToken } from "../src/lib/app-signing";

const registrationId = process.argv[2];
if (!registrationId) {
  console.error("usage: _mint-pay-token.ts <registrationId>");
  process.exit(1);
}

const token = createPayResumeToken(registrationId);
console.log(
  `http://localhost:3000/pay?registrationId=${registrationId}&payToken=${token}&tournament=community-cup-fall-2026`
);
