import { redirect } from "next/navigation";

/**
 * The separate Edit page is gone (B6): settings, schedule, scores and
 * announcements all live in tabs on the event page itself now. Old links and
 * bookmarks land on the Settings tab instead of a 404.
 */
export default async function EditTournamentRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/tournaments/${id}?tab=settings`);
}
