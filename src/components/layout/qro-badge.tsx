import Image from "next/image";

export function QroBadge() {
  return (
    <a
      href="https://qronnect.pro"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Need a website? Visit QRO"
      className="hidden md:flex fixed bottom-5 left-5 z-40 items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-full px-3 py-2 shadow-lg shadow-black/40 hover:border-zinc-500 hover:bg-zinc-800 transition-colors"
    >
      <Image src="/assets/qro-logo.png" alt="QRO" width={20} height={20} className="h-5 w-auto" />
      <span className="text-zinc-400 text-xs whitespace-nowrap">Need a website?</span>
    </a>
  );
}
