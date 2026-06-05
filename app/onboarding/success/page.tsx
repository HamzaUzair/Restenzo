"use client";

/**
 * /onboarding/success
 *
 * Shown after Stripe confirms the SetupIntent (card saved, trial live).
 * We clear the session-scoped onboarding context, then surface a clean
 * confirmation + CTA to sign in to the new portal.
 */
import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import Logo from "@/components/site/Logo";
import SiteBodyClass from "@/components/site/SiteBodyClass";
import ThemeToggle from "@/components/theme/ThemeToggle";
import TrialActivationLoader from "@/components/onboarding/TrialActivationLoader";

const STORAGE_KEY = "restenzo_onboarding_ctx";

/**
 * Keep the branded activation loader visible for at least this long so the
 * transition feels polished even when Stripe confirmation returns almost
 * instantly. We only flip to the final success/pending screen once BOTH the
 * confirmation request AND this minimum window have elapsed.
 */
const MIN_LOADING_MS = 2500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface StoredContext {
  restaurantId?: number;
  email?: string;
  planId?: string;
  cycle?: "monthly" | "yearly";
  trialEnd?: string | null;
  clientSecret?: string;
}

type ConfirmState = "checking" | "activated" | "pending" | "failed";

function readStored(): StoredContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredContext;
  } catch {
    return null;
  }
}

function SuccessInner() {
  const params = useSearchParams();
  const [ctx, setCtx] = useState<StoredContext | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>("checking");
  const [confirmMessage, setConfirmMessage] = useState<string>("");
  const [isRetrying, setIsRetrying] = useState(false);

  const urlSetupIntentClientSecret =
    params.get("setup_intent_client_secret") ?? "";

  const confirmActivation = async (opts?: { preserveStorage?: boolean }) => {
    const setupIntentClientSecret =
      urlSetupIntentClientSecret || ctx?.clientSecret || "";

    if (!setupIntentClientSecret) {
      setConfirmState("failed");
      setConfirmMessage(
        "We couldn't verify your payment setup from this link. Please use Complete payment setup again from login."
      );
      return;
    }

    setConfirmState("checking");
    setConfirmMessage("");

    // Run the confirmation request and the minimum loader window in parallel,
    // so the user always sees the polished loading screen for ~2.5s before the
    // final success/pending result swaps in.
    const startedAt = Date.now();
    const waitForMinimum = async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_LOADING_MS) await sleep(MIN_LOADING_MS - elapsed);
    };

    try {
      const res = await fetch("/api/auth/onboarding/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setupIntentClientSecret,
          restaurantId: ctx?.restaurantId ?? null,
        }),
      });
      const data = (await res.json()) as {
        activated?: boolean;
        pending?: boolean;
        error?: string;
        message?: string;
      };

      if (!res.ok) {
        // Genuine failures surface immediately; pending shares the loader's
        // minimum window so it doesn't flash.
        if (data.pending) await waitForMinimum();
        setConfirmState(data.pending ? "pending" : "failed");
        setConfirmMessage(
          data.error ??
            "We couldn't finalize your account activation yet. Please try again."
        );
        return;
      }

      if (data.activated) {
        await waitForMinimum();
        setConfirmState("activated");
        if (!opts?.preserveStorage) {
          try {
            window.sessionStorage.removeItem(STORAGE_KEY);
          } catch {
            // ignore
          }
        }
        return;
      }

      await waitForMinimum();
      setConfirmState("pending");
      setConfirmMessage(
        data.message ??
          "Payment setup looks pending. Please retry in a few seconds."
      );
    } catch {
      setConfirmState("failed");
      setConfirmMessage(
        "Network issue while confirming account activation. Please try again."
      );
    }
  };

  useEffect(() => {
    const stored = readStored();
    if (stored) setCtx(stored);
    void confirmActivation({ preserveStorage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSetupIntentClientSecret, ctx?.clientSecret]);

  const trialDateLabel = useMemo(() => {
    if (!ctx?.trialEnd) return null;
    try {
      return new Date(ctx.trialEnd).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return null;
    }
  }, [ctx?.trialEnd]);

  const loginHref = ctx?.email
    ? `/login?email=${encodeURIComponent(ctx.email)}`
    : "/login";

  const setupIntentStatus =
    confirmState === "activated"
      ? "Stripe confirmed your payment method"
      : null;

  return (
    <main className="site-scope min-h-screen bg-white dark:bg-[#05070d] text-gray-900 dark:text-gray-100">
      <SiteBodyClass />

      <header className="flex items-center justify-between p-6 sm:p-10">
        <Logo size="md" />
        <ThemeToggle />
      </header>

      <section className="flex items-start justify-center px-6 pb-20">
        <div className="w-full max-w-2xl">
          {confirmState === "checking" ? (
            <TrialActivationLoader />
          ) : (
          <div className="relative overflow-hidden rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm dark:border-white/10 dark:bg-[#0b1220]">
            <div
              aria-hidden
              className="absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-48 rounded-full bg-[#ff5a1f]/15 blur-3xl"
            />

            <span
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide ${
                confirmState === "activated"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : confirmState === "pending"
                  ? "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                  : "border border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {confirmState === "activated"
                ? "Trial activated"
                : confirmState === "pending"
                ? "Activation pending"
                : "Activation needs attention"}
            </span>

            <h1 className="mt-5 text-3xl sm:text-4xl font-extrabold tracking-tight">
              You&apos;re all set. Welcome to Restenzo.
            </h1>
            <p className="mt-3 text-gray-600 dark:text-gray-400">
              {confirmState === "activated"
                ? "Your 14 day free trial is live and your payment method is saved."
                : "We are finalizing your account activation from Stripe confirmation."}
              {confirmState === "activated" &&
                (trialDateLabel
                  ? ` Billing will automatically start on ${trialDateLabel}.`
                  : " Billing starts once your trial ends.")}
            </p>

            {setupIntentStatus && (
              <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-300">
                <ShieldCheck className="inline h-4 w-4 mr-1" />
                {setupIntentStatus}
              </p>
            )}
            {confirmState !== "activated" && confirmMessage && (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                {confirmMessage}
              </p>
            )}

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-400">
                  Due today
                </p>
                <p className="mt-1 text-lg font-bold">$0.00</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-400">
                  Trial ends
                </p>
                <p className="mt-1 text-lg font-bold">
                  {trialDateLabel ?? "In 14 days"}
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-400">
                  Billing starts
                </p>
                <p className="mt-1 text-lg font-bold">
                  {trialDateLabel ?? "After trial"}
                </p>
              </div>
            </div>

            <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
              {confirmState === "activated" ? (
                <Link
                  href={loginHref}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-brand text-white font-semibold shadow-[0_20px_40px_-15px_rgba(255,90,31,0.65)] hover:-translate-y-0.5 transition-all"
                >
                  <Sparkles className="h-4 w-4" />
                  Sign in to your portal
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-200 text-gray-500 font-semibold cursor-not-allowed dark:bg-white/10 dark:text-gray-400"
                >
                  <Sparkles className="h-4 w-4" />
                  Sign in to your portal
                </button>
              )}
              {confirmState !== "activated" && (
                <button
                  type="button"
                  onClick={async () => {
                    setIsRetrying(true);
                    await confirmActivation();
                    setIsRetrying(false);
                  }}
                  disabled={isRetrying}
                  className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-[#ff5a1f]/40 text-[#ff5a1f] font-semibold hover:bg-[#ff5a1f]/5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isRetrying ? "Retrying…" : "Try activation again"}
                </button>
              )}
              <Link
                href="/"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:border-[#ff5a1f]/40 hover:text-[#ff5a1f] transition-all dark:border-white/10 dark:text-gray-300"
              >
                Back to home
              </Link>
            </div>

            <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
              Cancel anytime before your trial ends from inside your portal to
              avoid being charged.
            </p>
          </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function OnboardingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          Confirming your trial…
        </div>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}
