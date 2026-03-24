const WHATSAPP_URL = "https://chat.whatsapp.com/HzBW39TgVemIA6EHWMnInY";

export function WhatsAppButton() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Join our WhatsApp community"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 bg-[#25D366] text-white rounded-full shadow-lg shadow-black/30 hover:bg-[#20bd5a] hover:shadow-xl hover:shadow-black/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 group pr-4 pl-3 py-3 md:py-2.5"
    >
      {/* Official WhatsApp logo SVG */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 48 48"
        className="w-6 h-6 flex-shrink-0"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M24 4C13 4 4 13 4 24c0 3.6 1 7 2.7 10L4 44l10.3-2.7C17.2 43 20.5 44 24 44c11 0 20-9 20-20S35 4 24 4zm0 36c-3.1 0-6.1-.8-8.7-2.4l-.6-.4-6.1 1.6 1.6-5.9-.4-.6C8.2 30.3 7.4 27.2 7.4 24 7.4 14.8 14.9 7.4 24 7.4S40.6 14.9 40.6 24 33.1 40 24 40zm10.9-14.5c-.6-.3-3.5-1.7-4-1.9-.5-.2-.9-.3-1.3.3-.4.6-1.5 1.9-1.8 2.3-.3.4-.7.4-1.3.1-.6-.3-2.5-.9-4.7-2.9-1.7-1.5-2.9-3.4-3.2-4-.3-.6 0-.9.3-1.2.3-.3.6-.7.9-1 .3-.3.4-.6.6-1 .2-.4.1-.7 0-1-.1-.3-1.3-3.2-1.8-4.3-.5-1.1-1-1-1.3-1H16c-.4 0-1 .1-1.5.7-.5.6-2 1.9-2 4.7s2 5.5 2.3 5.8c.3.4 4 6.1 9.7 8.6 1.4.6 2.4.9 3.3 1.2 1.4.4 2.6.4 3.6.2 1.1-.2 3.5-1.4 4-2.8.5-1.4.5-2.5.3-2.8-.1-.2-.5-.4-1.1-.6z" />
      </svg>
      <span className="text-sm font-semibold whitespace-nowrap">Join Community</span>
    </a>
  );
}
