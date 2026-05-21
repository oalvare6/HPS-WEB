import { Section } from "@/components/shared/section";
import { MePageSkeleton } from "@/components/shared/skeleton";

export default function MeLoading() {
  return (
    <>
      <section className="bg-base text-white py-12 md:py-16 bg-tactical-grid">
        <div className="max-w-4xl mx-auto px-6 space-y-3">
          <div className="h-3 w-24 rounded bg-surface-2/80 animate-pulse" />
          <div className="h-9 w-64 max-w-full rounded bg-surface-2/80 animate-pulse" />
          <div className="h-4 w-48 rounded bg-surface-2/80 animate-pulse" />
        </div>
      </section>
      <Section dark className="bg-surface !py-8 md:!py-12" container={false}>
        <MePageSkeleton />
      </Section>
    </>
  );
}
