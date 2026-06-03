import { ContactPageClient } from "@/app/contact/ContactPageClient";
import { ContactWhatsAppInfo } from "@/components/contact/ContactWhatsAppInfo";

export const dynamic = "force-dynamic";

export default function ContactPage() {
  return <ContactPageClient whatsAppSlot={<ContactWhatsAppInfo />} />;
}
