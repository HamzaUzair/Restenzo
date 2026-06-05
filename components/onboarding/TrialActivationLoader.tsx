"use client";

/**
 * TrialActivationLoader
 *
 * Branded, dark-theme loading screen shown while we confirm the Stripe
 * SetupIntent and provision the new Restenzo portal. It deliberately renders
 * NO portal CTAs (Sign in / Retry / Back to home) and no success cards — only
 * the activation progress — so it never looks like the final success screen.
 */
import React, { useEffect, useState } from "react";
import { Check, CreditCard, Loader2, LayoutDashboard, Store } from "lucide-react";

const STEPS = [
  { label: "Securing payment method", Icon: CreditCard },
  { label: "Creating restaurant workspace", Icon: Store },
  { label: "Preparing your portal", Icon: LayoutDashboard },
] as const;

const TrialActivationLoader: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);

  // Gently advance the checklist so the wait feels purposeful. The steps loop
  // back to the last one and hold there until the parent swaps in the final
  // success screen.
  useEffect(() => {
    const timers = [
      window.setTimeout(() => setActiveStep(1), 850),
      window.setTimeout(() => setActiveStep(2), 1700),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm dark:border-white/10 dark:bg-[#0b1220]">
      {/* Soft orange glow behind the icon / progress bar */}
      <div
        aria-hidden
        className="absolute -top-24 left-1/2 -translate-x-1/2 h-56 w-56 rounded-full bg-[#ff5a1f]/20 blur-3xl"
      />

      <div className="relative">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide border border-[#ff5a1f]/30 bg-[#ff5a1f]/10 text-[#ff5a1f]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Confirming activation
        </span>

        {/* Brand icon with pulsing glow ring */}
        <div className="relative mx-auto mt-7 flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 rounded-2xl bg-[#ff5a1f]/15 animate-ping" />
          <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-brand text-white shadow-[0_20px_40px_-15px_rgba(255,90,31,0.7)]">
            <Loader2 className="h-7 w-7 animate-spin" />
          </span>
        </div>

        <h1 className="mt-6 text-3xl sm:text-4xl font-extrabold tracking-tight">
          Activating your trial
        </h1>
        <p className="mx-auto mt-3 max-w-md text-gray-600 dark:text-gray-400">
          Please wait while we confirm your payment method and prepare your
          Restenzo portal.
        </p>

        {/* Indeterminate orange progress bar */}
        <div className="mx-auto mt-8 h-2 w-full max-w-sm overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
          <div className="trz-bar h-full w-2/5 rounded-full bg-gradient-brand" />
        </div>

        {/* Checklist animation */}
        <ul className="mx-auto mt-8 max-w-sm space-y-2.5 text-left">
          {STEPS.map((step, idx) => {
            const done = idx < activeStep;
            const current = idx === activeStep;
            const StepIcon = step.Icon;
            return (
              <li
                key={step.label}
                className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors ${
                  done
                    ? "border-[#ff5a1f]/30 bg-[#ff5a1f]/5"
                    : current
                    ? "border-[#ff5a1f]/30 bg-[#ff5a1f]/5"
                    : "border-gray-100 bg-gray-50 dark:border-white/10 dark:bg-white/5"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    done || current
                      ? "bg-[#ff5a1f]/15 text-[#ff5a1f]"
                      : "bg-gray-200 text-gray-400 dark:bg-white/10 dark:text-gray-500"
                  }`}
                >
                  {done ? (
                    <Check className="h-4 w-4" />
                  ) : current ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <StepIcon className="h-4 w-4" />
                  )}
                </span>
                <span
                  className={`text-sm font-medium ${
                    done || current
                      ? "text-gray-800 dark:text-gray-100"
                      : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-7 text-xs text-gray-500 dark:text-gray-400">
          This only takes a few seconds. Please don&apos;t close this window.
        </p>
      </div>

      <style>{`
        @keyframes trzBarSlide {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(360%); }
        }
        .trz-bar {
          animation: trzBarSlide 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default TrialActivationLoader;
