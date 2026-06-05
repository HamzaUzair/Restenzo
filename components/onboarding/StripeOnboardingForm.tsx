"use client";

/**
 * StripeOnboardingForm
 *
 * Client component that renders the Stripe Payment Element bound to the
 * SetupIntent client_secret returned by `/api/auth/signup-trial`. The
 * form collects card details today but does NOT charge the customer —
 * Stripe saves the card as the default payment method so the first
 * invoice runs after the 14-day trial window.
 *
 * All Stripe keys are injected via env vars (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
 * We lazy-load `@stripe/stripe-js` so the bundle for non-onboarding pages
 * stays small.
 */
import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { ArrowRight, Loader2, Lock, ShieldCheck } from "lucide-react";

export interface StripeOnboardingContext {
  clientSecret: string;
  publishableKey: string;
  email: string;
  planName: string;
  cycle: "monthly" | "yearly";
  trialEnd: string | null;
  returnUrl: string;
}

function useStripePromise(publishableKey: string) {
  return useMemo<Promise<StripeJs | null>>(
    () => loadStripe(publishableKey),
    [publishableKey]
  );
}

const PaymentCard: React.FC<{
  email: string;
  planName: string;
  cycle: "monthly" | "yearly";
  trialEnd: string | null;
  returnUrl: string;
}> = ({ email, planName, cycle, trialEnd, returnUrl }) => {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentElementReady, setPaymentElementReady] = useState(false);

  const canSubmit =
    Boolean(stripe) &&
    Boolean(elements) &&
    paymentElementReady &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !paymentElementReady) {
      setError(
        "Payment form is still loading. Please wait a moment and try again."
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Please check your card details.");
      setSubmitting(false);
      return;
    }

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: returnUrl,
      },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(
        confirmError.message ??
          "We couldn't save your card. Please try a different one."
      );
      setSubmitting(false);
      return;
    }

    // If `redirect: "if_required"` returns without redirecting, we still
    // need to carry the setup_intent_client_secret so success verification
    // can reconcile activation server-side.
    if (setupIntent?.client_secret) {
      const successUrl = new URL(returnUrl, window.location.origin);
      successUrl.searchParams.set(
        "setup_intent_client_secret",
        setupIntent.client_secret
      );
      router.push(`${successUrl.pathname}${successUrl.search}`);
      return;
    }

    router.push(returnUrl);
  };

  const trialDate = trialEnd
    ? new Date(trialEnd).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-widest uppercase text-[#ff5a1f]">
              {planName}
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {cycle === "yearly" ? "Yearly billing" : "Monthly billing"} · {email}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-semibold dark:bg-emerald-500/10 dark:text-emerald-300">
            <ShieldCheck className="h-3 w-3" /> Secured by Stripe
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-3">
            <p className="text-gray-500 dark:text-gray-400">Due today</p>
            <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">
              $0.00
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-3">
            <p className="text-gray-500 dark:text-gray-400">Billing starts</p>
            <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">
              {trialDate ?? "After 14 day trial"}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-5">
        <label className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400">
          <Lock className="h-3.5 w-3.5" /> Payment details
        </label>
        <div className="mt-3">
          <PaymentElement
            options={{
              layout: "tabs",
            }}
            onReady={() => {
              setPaymentElementReady(true);
              setError(null);
            }}
            onChange={() => {
              if (!paymentElementReady) setPaymentElementReady(true);
            }}
          />
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-300 text-sm rounded-xl px-4 py-3"
        >
          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-brand text-white font-semibold shadow-[0_20px_40px_-15px_rgba(255,90,31,0.65)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Starting trial…
          </>
        ) : (
          <>
            Start 14 day free trial <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>

      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        You will not be charged today. Your card is saved and billing starts{" "}
        {trialDate ? `on ${trialDate}` : "after your 14 day trial"}. Cancel
        anytime before then.
      </p>
    </form>
  );
};

const StripeOnboardingForm: React.FC<{ ctx: StripeOnboardingContext }> = ({
  ctx,
}) => {
  const stripePromise = useStripePromise(ctx.publishableKey);

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: ctx.clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#ff5a1f",
            colorText: "#111827",
            colorBackground: "#ffffff",
            borderRadius: "12px",
            fontFamily:
              'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          },
        },
      }}
    >
      <PaymentCard
        email={ctx.email}
        planName={ctx.planName}
        cycle={ctx.cycle}
        trialEnd={ctx.trialEnd}
        returnUrl={ctx.returnUrl}
      />
    </Elements>
  );
};

export default StripeOnboardingForm;
