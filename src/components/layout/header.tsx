import { getSiteSetting } from "@/lib/site-settings";
import { HeaderClient } from "@/components/layout/header-client";

export async function Header() {
  const statusItems = await getSiteSetting("home.status_pills");
  return <HeaderClient statusItems={statusItems} />;
}
