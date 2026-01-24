import { Section, SectionHeader } from "@/components/shared/section";
import { ImagePlaceholder } from "@/components/shared/image-placeholder";
import { Target, Users, Award } from "lucide-react";

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-zinc-950 text-white py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Built for Houston Soccer
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            A facility and organization focused on what matters: the game, the community, 
            and doing things right.
          </p>
        </div>
      </section>

      {/* Story */}
      <Section>
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <SectionHeader title="The Story" />
            <div className="space-y-4 text-zinc-600 leading-relaxed">
              <p>
                Houston Premier Soccer started with a straightforward goal: create a place 
                where competitive soccer is run properly. No shortcuts on field quality. 
                No disorganized events. No excuses.
              </p>
              <p>
                We saw a gap in the Houston area—plenty of places to play, but few that 
                consistently delivered on the basics. Quality turf. Professional lighting. 
                Events that start on time. Clear communication.
              </p>
              <p>
                That&apos;s what we focus on. Whether it&apos;s a youth tournament on Saturday 
                morning or an adult league game under the lights, every player and family 
                should expect the same standard.
              </p>
            </div>
          </div>
          <ImagePlaceholder caption="Sideline view during a weekend tournament" />
        </div>
      </Section>

      {/* Divider */}
      <div className="max-w-6xl mx-auto px-6">
        <hr className="border-zinc-200" />
      </div>

      {/* Values */}
      <Section>
        <SectionHeader
          title="What We Stand For"
          align="center"
        />

        <div className="grid md:grid-cols-3 gap-8 mt-12">
          {/* Competition */}
          <div className="text-center p-8">
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Target size={28} className="text-zinc-700" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 mb-3">Competition</h3>
            <p className="text-zinc-600 leading-relaxed">
              Fair, challenging play at every level. We believe competition makes 
              everyone better—when it&apos;s organized well.
            </p>
          </div>

          {/* Community */}
          <div className="text-center p-8">
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users size={28} className="text-zinc-700" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 mb-3">Community</h3>
            <p className="text-zinc-600 leading-relaxed">
              Youth players developing skills. Adults competing after work. 
              Families on the sidelines. This is Houston soccer.
            </p>
          </div>

          {/* Quality */}
          <div className="text-center p-8">
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Award size={28} className="text-zinc-700" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-900 mb-3">Quality</h3>
            <p className="text-zinc-600 leading-relaxed">
              From field conditions to event logistics, we handle the details. 
              Players should focus on the game, not the setup.
            </p>
          </div>
        </div>
      </Section>

      {/* Local */}
      <Section className="bg-zinc-50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900 mb-6">
            Locally Owned. Directly Accountable.
          </h2>
          <p className="text-lg text-zinc-600 leading-relaxed">
            We&apos;re not a chain. There&apos;s no corporate office. When something needs 
            to be addressed, you&apos;re talking to the people who run the facility. 
            That accountability is the point.
          </p>
        </div>
      </Section>
    </>
  );
}
