import { getSiteSetting } from "@/lib/site-settings";
import { HeaderClient } from "@/components/layout/header-client";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function Header() {
  const statusItems = await getSiteSetting("home.status_pills");

  // Phase 6: pass the player's auth status so the header can show
  // "Account" vs "Sign in". Failures here must not break the header for
  // anonymous visitors.
  let isAuthed = false;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isAuthed = Boolean(user);
  } catch {
    isAuthed = false;
  }

  return <HeaderClient statusItems={statusItems} isAuthed={isAuthed} />;
}
