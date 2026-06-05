import type { Metadata } from "next";
import Container from "@/components/site/Container";
import Reveal from "@/components/site/Reveal";
import PricingSection from "@/components/site/pricing/PricingSection";
import ComparisonTable from "@/components/site/pricing/ComparisonTable";
import FAQAccordion from "@/components/site/FAQAccordion";
import FinalCTA from "@/components/site/home/FinalCTA";
import { getPublicPlans } from "@/lib/plans";

// Always render with the latest plan data the Platform Admin has saved.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for single branch restaurants, multi branch chains and enterprise. 14 day free trial, no credit card required.",
};

const pricingFAQs = [
  {
    q: "Is there a free trial?",
    a: "Yes every plan includes a 14 day free trial with full access. We ask for a card at signup so billing can start automatically after the trial, but you are not charged during the trial and you can cancel any time.",
  },
  {
    q: "Can I switch plans later?",
    a: "Absolutely. You can upgrade or downgrade at any time from inside Restenzo. Billing is automatically prorated.",
  },
  {
    q: "Do you offer discounts for yearly billing?",
    a: "Yes. Choosing yearly billing saves you 20% compared to monthly billing across all paid plans.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit cards via our Stripe integration. For Enterprise plans we also support ACH and invoicing.",
  },
  {
    q: "How many branches does the Multi Branch plan include?",
    a: "Up to 10 branches are included. Need more? Our Enterprise plan scales to unlimited branches with dedicated support.",
  },
  {
    q: "Do you offer onboarding and data migration?",
    a: "Yes every paid plan includes guided onboarding. Enterprise customers get white glove migration from their existing system.",
  },
];

export default async function PricingPage() {
  const plans = await getPublicPlans();
  return (
    <>
      <section className="relative overflow-hidden pt-20 pb-6 lg:pt-28">
        <div className="absolute inset-0 bg-gradient-brand-soft -z-10" />
        <div className="absolute inset-0 grid-pattern -z-10 opacity-50" />
        <Container>
          <Reveal className="max-w-3xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#ff5a1f]/25 bg-[#ff5a1f]/10 text-[#ff5a1f] text-xs font-semibold tracking-wide">
              Pricing
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-[1.07]">
              Simple pricing.{" "}
              <span className="text-gradient-brand">Zero surprises.</span>
            </h1>
            <p className="mt-5 text-lg text-gray-600 dark:text-gray-400">
              Choose a plan for a single restaurant or scale to a multi branch
              chain. Every plan includes a 14 day free trial. Add a card at
              signup so billing starts automatically after the trial.
            </p>
          </Reveal>
        </Container>
      </section>

      <PricingSection plans={plans} />
      <ComparisonTable />

      <section className="py-20 lg:py-24 border-t border-gray-100 dark:border-white/5">
        <Container size="md">
          <Reveal className="text-center">
            <p className="text-xs font-semibold tracking-[0.22em] uppercase text-[#ff5a1f]">
              Pricing FAQ
            </p>
            <h2 className="mt-3 text-3xl lg:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
              Questions, answered.
            </h2>
          </Reveal>
          <div className="mt-10">
            <FAQAccordion items={pricingFAQs} />
          </div>
        </Container>
      </section>

      <FinalCTA />
    </>
  );
}
