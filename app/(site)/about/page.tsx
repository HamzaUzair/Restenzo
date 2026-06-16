import type { Metadata } from "next";
import {
  Target,
  Gem,
  Users,
  Globe2,
  Heart,
  Rocket,
  Shield,
} from "lucide-react";
import Container from "@/components/site/Container";
import Reveal from "@/components/site/Reveal";
import FinalCTA from "@/components/site/home/FinalCTA";

export const metadata: Metadata = {
  title: "About",
  description:
    "Restenzo is building the operating system for modern restaurants — crafted by a team that has actually run restaurants.",
};

const values = [
  {
    icon: Heart,
    title: "Operator first",
    desc: "Every pixel is shaped by people who have actually worked a busy Friday service.",
  },
  {
    icon: Gem,
    title: "Craft over quantity",
    desc: "We’d rather ship one beautiful feature than ten mediocre ones.",
  },
  {
    icon: Shield,
    title: "Trust by default",
    desc: "Security, uptime and privacy are non negotiable foundations of our product.",
  },
  {
    icon: Rocket,
    title: "Ship, listen, improve",
    desc: "Fast iterations with our customers keep Restenzo sharp and relevant.",
  },
];

const timeline = [
  {
    year: "2024",
    title: "The first POS release",
    desc: "Restenzo starts with a handful of single branch restaurants as our design partners.",
  },
  {
    year: "2025",
    title: "Multi branch head office",
    desc: "We roll out centralised control for chains menus, deals, roles and analytics across branches.",
  },
  {
    year: "2026",
    title: "The platform era",
    desc: "A full SaaS platform for restaurants of every size, with a public website, self serve signup and billing.",
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden pt-20 pb-16 lg:pt-28 lg:pb-20">
        <div className="absolute inset-0 bg-gradient-brand-soft -z-10" />
        <div className="absolute inset-0 grid-pattern -z-10 opacity-50" />
        <Container>
          <Reveal className="max-w-3xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#ff5a1f]/25 bg-[#ff5a1f]/10 text-[#ff5a1f] text-xs font-semibold tracking-wide">
              About Restenzo
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-[1.07]">
              Software built for the{" "}
              <span className="text-gradient-brand">people behind the pass.</span>
            </h1>
            <p className="mt-5 text-lg text-gray-600 dark:text-gray-400">
              We started Restenzo because the tools available to restaurant
              owners were either ancient or bolted together. So we built the
              operating system we wished we had.
            </p>
          </Reveal>
        </Container>
      </section>

      {/* Mission */}
      <section className="py-16 lg:py-20">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <Reveal>
              <p className="text-xs font-semibold tracking-[0.22em] uppercase text-[#ff5a1f]">
                Our mission
              </p>
              <h2 className="mt-3 text-3xl lg:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
                Make every restaurant run like the best one.
              </h2>
              <p className="mt-4 text-gray-600 dark:text-gray-400 leading-relaxed">
                We believe great food deserves great operations. Restenzo
                brings enterprise grade tooling order taking, kitchen
                display, multi branch analytics, financials to restaurants
                of every size, in a product that’s actually a pleasure to use.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-4">
                {[
                  { icon: Target, label: "Focused" },
                  { icon: Users, label: "Team first" },
                  { icon: Globe2, label: "Global" },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-gray-100 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4 text-center"
                  >
                    <Icon className="mx-auto h-5 w-5 text-[#ff5a1f]" />
                    <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className="relative rounded-3xl p-8 border border-gray-100 dark:border-white/10 bg-white dark:bg-white/[0.02]">
                <div className="absolute -top-4 -left-4 h-24 w-24 rounded-full bg-[#ff5a1f]/15 blur-2xl" />
                <blockquote className="relative">
                  <p className="text-lg lg:text-xl text-gray-800 dark:text-gray-200 leading-relaxed">
                    “A restaurant runs on tiny details a ticket at the right
                    station, a cashier that doesn’t stall, a report that tells
                    you the truth. We obsess over those details so our
                    customers don’t have to.”
                  </p>
                  <footer className="mt-6 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-brand text-white font-bold flex items-center justify-center">
                      R
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        The Restenzo team
                      </p>
                      <p className="text-xs text-gray-500">Founders & engineers</p>
                    </div>
                  </footer>
                </blockquote>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* Values */}
      <section className="py-16 lg:py-20 border-t border-gray-100 dark:border-white/5 bg-gray-50/60 dark:bg-white/[0.02]">
        <Container>
          <Reveal className="max-w-2xl mx-auto text-center">
            <p className="text-xs font-semibold tracking-[0.22em] uppercase text-[#ff5a1f]">
              Our values
            </p>
            <h2 className="mt-3 text-3xl lg:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
              What we care about.
            </h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {values.map((v, i) => (
              <Reveal
                key={v.title}
                delay={i * 80}
                className="rounded-2xl p-6 border border-gray-100 dark:border-white/10 bg-white dark:bg-white/[0.02] card-hover"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#ff5a1f]/10 text-[#ff5a1f]">
                  <v.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold text-gray-900 dark:text-white">
                  {v.title}
                </h3>
                <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {v.desc}
                </p>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* Timeline */}
      <section className="py-16 lg:py-20" id="careers">
        <Container size="md">
          <Reveal className="text-center">
            <p className="text-xs font-semibold tracking-[0.22em] uppercase text-[#ff5a1f]">
              Our story
            </p>
            <h2 className="mt-3 text-3xl lg:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
              From a single restaurant to a platform.
            </h2>
          </Reveal>

          <div className="mt-12 relative">
            <div className="absolute left-4 top-2 bottom-2 w-px bg-gradient-to-b from-[#ff5a1f]/40 via-[#ff5a1f]/20 to-transparent" />
            <ul className="space-y-8">
              {timeline.map((t, i) => (
                <Reveal
                  as="li"
                  key={t.year}
                  delay={i * 100}
                  className="relative pl-14"
                >
                  <span className="absolute left-0 top-1.5 h-9 w-9 rounded-full bg-gradient-brand text-white font-bold text-xs flex items-center justify-center shadow-lg">
                    {t.year}
                  </span>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {t.title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {t.desc}
                  </p>
                </Reveal>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <FinalCTA />
    </>
  );
}
