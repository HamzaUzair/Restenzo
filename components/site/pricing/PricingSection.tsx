"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import Container from "../Container";
import Reveal from "../Reveal";
import { YEARLY_DISCOUNT_PERCENT, type BillingCycle } from "@/lib/pricing";
import type { PublicPlan } from "@/types/plan";

interface PricingSectionProps {
  plans: PublicPlan[];
}

const PricingSection: React.FC<PricingSectionProps> = ({ plans }) => {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const isYearly = cycle === "yearly";

  return (
    <section className="py-16 lg:py-20">
      <Container>
        {/* Toggle */}
        <Reveal className="flex justify-center">
          <div className="relative inline-grid grid-cols-2 items-center rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-1 shadow-sm min-w-[320px]">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={`relative z-10 w-full px-4 py-2 text-sm font-semibold rounded-full transition-colors ${
                !isYearly
                  ? "text-white"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setCycle("yearly")}
              className={`relative z-10 w-full px-4 py-2 text-sm font-semibold rounded-full transition-colors flex items-center justify-center gap-2 ${
                isYearly
                  ? "text-white"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Yearly
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wide ${
                  isYearly
                    ? "bg-white/25 text-white"
                    : "bg-[#ff5a1f]/10 text-[#ff5a1f]"
                }`}
              >
                SAVE {YEARLY_DISCOUNT_PERCENT}%
              </span>
            </button>
            <span
              aria-hidden
              className={`absolute left-1 top-1 bottom-1 w-[calc((100%-0.5rem)/2)] rounded-full bg-gradient-brand shadow-[0_8px_24px_-8px_rgba(255,90,31,0.65)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isYearly ? "translate-x-full" : "translate-x-0"
              }`}
            />
          </div>
        </Reveal>

        {/* Cards */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan, i) => {
            const isCustom = plan.isCustom;
            const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
            const signupHref = `/signup?plan=${plan.slug}&cycle=${cycle}`;
            const href = isCustom ? "/contact" : signupHref;

            return (
              <Reveal
                key={plan.slug}
                delay={i * 100}
                className={`group relative flex flex-col rounded-3xl p-8 card-hover ${
                  plan.isPopular
                    ? "border-2 border-[#ff5a1f] bg-white dark:bg-[#0b1220] shadow-[0_40px_120px_-40px_rgba(255,90,31,0.6)]"
                    : "border border-gray-100 dark:border-white/10 bg-white dark:bg-white/[0.02]"
                }`}
              >
                {plan.isPopular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-brand text-white text-[11px] font-bold tracking-wide shadow-lg">
                    <Sparkles className="h-3 w-3" />
                    Most popular
                  </span>
                )}

                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {plan.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {plan.description}
                  </p>
                </div>

                <div className="mt-6 flex items-baseline gap-1.5">
                  {isCustom ? (
                    <span className="text-4xl font-extrabold text-gray-900 dark:text-white">
                      Custom
                    </span>
                  ) : (
                    <>
                      <span className="text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                        ${price}
                      </span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {plan.billingLabel || "/mo"}
                      </span>
                    </>
                  )}
                </div>
                {!isCustom && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {isYearly
                      ? `Billed yearly $${plan.yearlyPrice * 12}/yr`
                      : "Billed monthly"}
                  </p>
                )}

                <Link
                  href={href}
                  className={`mt-6 inline-flex items-center justify-center px-5 py-3 rounded-xl font-semibold text-sm transition-all ${
                    plan.isPopular
                      ? "bg-gradient-brand text-white shadow-[0_16px_40px_-14px_rgba(255,90,31,0.6)] hover:-translate-y-0.5"
                      : "border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white hover:border-[#ff5a1f]/40 hover:text-[#ff5a1f]"
                  }`}
                >
                  {plan.ctaLabel || "Get started"}
                </Link>

                <ul className="mt-7 space-y-2.5">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300"
                    >
                      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#ff5a1f]/10 text-[#ff5a1f]">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </Reveal>
            );
          })}
        </div>

        {/* Money-back line */}
        <Reveal className="mt-10 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            All plans include a <strong>14 day free trial</strong>. Add a card
            at signup so billing starts automatically after the trial. Cancel
            anytime.
          </p>
        </Reveal>
      </Container>
    </section>
  );
};

export default PricingSection;
