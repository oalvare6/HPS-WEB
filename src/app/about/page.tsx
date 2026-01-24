import Image from "next/image";
import { Section, SectionHeader } from "@/components/shared/section";
import { Target, Users, Award } from "lucide-react";

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-zinc-950 text-white py-16 md:py-24 bg-tactical-grid">
        <div className="max-w-6xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            Built for 7v7 Soccer
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            A facility and organization focused on fast-paced 7v7 play: the game, the community, 
            and doing things right.
          </p>
        </div>
      </section>

      {/* Story */}
      <Section dark className="bg-zinc-900 bg-topo-lines">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <SectionHeader title="The Story" dark />
            <div className="space-y-4 text-zinc-400 leading-relaxed">
              <p>
                Houston Premier Soccer started with a straightforward goal: create a place 
                where competitive 7v7 soccer is run properly. No shortcuts on field quality. 
                No disorganized events. No excuses.
              </p>
              <p>
                We saw a gap in the Houston area—plenty of places to play, but few that 
                consistently delivered on the basics for 7v7 soccer. Quality turf sized for 
                fast-paced play. Professional lighting. Events that start on time. Clear communication.
              </p>
              <p>
                That&apos;s what we focus on. Whether it&apos;s a youth 7v7 tournament on Saturday 
                morning or an adult league game under the lights, every player and family 
                should expect the same standard.
              </p>
            </div>
          </div>
          
          {/* About Image */}
          <div className="dashboard-card aspect-video relative overflow-hidden">
            <Image
              src="https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=800&q=80"
              alt="Soccer players on the field"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white font-semibold text-lg">SINCE 2020</span>
            </div>
          </div>
        </div>
      </Section>

      {/* Values */}
      <Section dark className="bg-zinc-950 bg-tactical-grid">
        <SectionHeader
          title="What We Stand For"
          align="center"
          dark
        />

        <div className="grid md:grid-cols-3 gap-6 mt-10">
          {/* Competition */}
          <div className="dashboard-card text-center p-8">
            <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <Target size={28} className="text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Competition</h3>
            <p className="text-zinc-400 leading-relaxed">
              Fair, challenging play at every level. We believe competition makes 
              everyone better—when it&apos;s organized well.
            </p>
          </div>

          {/* Community */}
          <div className="dashboard-card text-center p-8">
            <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users size={28} className="text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Community</h3>
            <p className="text-zinc-400 leading-relaxed">
              Youth players developing skills. Adults competing after work. 
              Families on the sidelines. This is Houston soccer.
            </p>
          </div>

          {/* Quality */}
          <div className="dashboard-card text-center p-8">
            <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <Award size={28} className="text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">Quality</h3>
            <p className="text-zinc-400 leading-relaxed">
              From field conditions to event logistics, we handle the details. 
              Players should focus on the game, not the setup.
            </p>
          </div>
        </div>
      </Section>

      {/* Local */}
      <Section dark className="bg-zinc-900">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-6">
            Locally Owned. Directly Accountable.
          </h2>
          <p className="text-lg text-zinc-400 leading-relaxed">
            We&apos;re not a chain. There&apos;s no corporate office. When something needs 
            to be addressed, you&apos;re talking to the people who run the facility. 
            That accountability is the point.
          </p>
        </div>
      </Section>

      {/* Bottom padding for mobile fixed bar */}
      <div className="h-20 md:hidden bg-zinc-900" />
    </>
  );
}
