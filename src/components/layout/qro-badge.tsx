import Image from "next/image";

export function QroBadge() {
  return (
    <a
      href="https://qronnect.pro"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Need a website? Visit QRO"
      className="hidden md:flex fixed bottom-5 left-5 z-40 items-center gap-2 bg-surface border border-border-token rounded-full px-3 py-2 shadow-lg shadow-black/40 hover:border-brand/50 hover:bg-surface-2 transition-colors"
    >
      <Image src="/assets/qro-logo.png" alt="QRO" width={20} height={20} className="h-5 w-auto" />
      <span className="text-zinc-400 text-xs whitespace-nowrap">Need a website?</span>
    </a>
  );
}
