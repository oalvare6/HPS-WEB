import { WhatsAppCommunityLinkFromSite } from "@/components/shared/WhatsAppCommunityLink";
import { WhatsAppIcon } from "@/components/shared/WhatsAppIcon";

/** Contact page WhatsApp row — URL from site settings. */
export async function ContactWhatsAppInfo() {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#25D366]">
        <WhatsAppIcon className="h-5 w-5 text-white" />
      </div>
      <div>
        <h3 className="font-medium text-white">WhatsApp Community</h3>
        <WhatsAppCommunityLinkFromSite
          variant="inline"
          showIcon={false}
          className="text-[#25D366] no-underline hover:text-[#20bd5a]"
        >
          Join our community chat
        </WhatsAppCommunityLinkFromSite>
      </div>
    </div>
  );
}
