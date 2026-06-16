"use client";

import React, {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Store,
  User,
  Utensils,
} from "lucide-react";
import Logo from "@/components/site/Logo";
import ThemeToggle from "@/components/theme/ThemeToggle";
import SiteBodyClass from "@/components/site/SiteBodyClass";
import { PLANS, YEARLY_DISCOUNT_PERCENT, type BillingCycle } from "@/lib/pricing";
import {
  validateEmailUsername,
  validateNameWithLetters,
} from "@/lib/user-validation";
import type { PublicPlan } from "@/types/plan";

type PlanId = "single" | "multi" | "enterprise";
type RestaurantType = "SINGLE" | "MULTI";

/** Normalized plan shape the signup sidebar renders. */
interface SignupPlan {
  slug: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
}

/** Bundled defaults used until the public plans API resolves (or if it fails). */
const FALLBACK_SIGNUP_PLANS: SignupPlan[] = PLANS.map((p) => ({
  slug: p.id,
  name: p.name,
  description: p.tagline,
  monthlyPrice: p.monthly,
  yearlyPrice: p.yearly,
  features: [...p.features],
}));

function SignUpInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = (searchParams.get("plan") as PlanId | null) ?? "multi";
  const cycleParam = (searchParams.get("cycle") as BillingCycle | null) ?? "monthly";

  const [fullName, setFullName] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [restaurantType, setRestaurantType] = useState<RestaurantType>(
    planParam === "single" ? "SINGLE" : "MULTI"
  );
  const [cycle, setCycle] = useState<BillingCycle>(cycleParam);
  const [agree, setAgree] = useState(true);
  const [error, setError] = useState("");
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resumingSetup, setResumingSetup] = useState(false);

  const [plans, setPlans] = useState<SignupPlan[]>(FALLBACK_SIGNUP_PLANS);

  useEffect(() => {
    let active = true;
    fetch("/api/public/plans")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { plans: PublicPlan[] } | null) => {
        if (!active || !body?.plans?.length) return;
        setPlans(
          body.plans.map((p) => ({
            slug: p.slug,
            name: p.name,
            description: p.description,
            monthlyPrice: p.monthlyPrice,
            yearlyPrice: p.yearlyPrice,
            features: p.features,
          }))
        );
      })
      .catch(() => {
        /* keep fallback defaults */
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedPlan = useMemo(() => {
    const wanted = restaurantType === "SINGLE" ? "single" : "multi";
    return (
      plans.find((p) => p.slug === wanted) ??
      FALLBACK_SIGNUP_PLANS.find((p) => p.slug === wanted)!
    );
  }, [restaurantType, plans]);

  const price =
    cycle === "yearly" ? selectedPlan.yearlyPrice : selectedPlan.monthlyPrice;

  const strength = useMemo(() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s; // 0..4
  }, [password]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setResumeToken(null);

    const fullNameError = validateNameWithLetters(fullName);
    if (fullNameError) {
      setError(fullNameError);
      return;
    }

    const restaurantNameError = validateNameWithLetters(
      restaurantName,
      "Restaurant name"
    );
    if (restaurantNameError) {
      setError(restaurantNameError);
      return;
    }

    const emailError = validateEmailUsername(email, "Work email");
    if (emailError) {
      setError(emailError);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!agree) {
      setError("Please agree to the Terms and Privacy Policy.");
      return;
    }

    setLoading(true);

    try {
      // Step 1: create the tenant + admin user and start a trialing
      // Stripe subscription. Stripe returns a SetupIntent client_secret
      // which the onboarding page uses to mount the Payment Element.
      const res = await fetch("/api/auth/signup-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          password,
          restaurantName,
          restaurantType,
          cycle,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.errorCode === "ONBOARDING_INCOMPLETE" && data?.canResumeSetup) {
          setResumeToken(data.resumeToken ?? null);
        }
        throw new Error(data?.error || "Signup failed. Please try again.");
      }

      const stripeCtx = data.stripe ?? {};

      if (stripeCtx.enabled && stripeCtx.clientSecret && stripeCtx.publishableKey) {
        // Persist the onboarding context for the /onboarding step.
        const ctx = {
          restaurantId: data.restaurantId,
          userId: data.userId,
          email: data.email,
          planId: data.planId,
          cycle: data.cycle,
          trialEnd: data.trialEnd,
          clientSecret: stripeCtx.clientSecret,
          publishableKey: stripeCtx.publishableKey,
        };
        try {
          window.sessionStorage.setItem(
            "restenzo_onboarding_ctx",
            JSON.stringify(ctx)
          );
        } catch {
          // sessionStorage can fail on private-mode browsers; the
          // onboarding page will surface a friendly retry in that case.
        }
        router.push("/onboarding");
      } else if (stripeCtx.enabled) {
        // Stripe is enabled but this signup did not receive a usable
        // onboarding client secret. Keep the account pending and ask the
        // user to retry instead of sending them to login.
        throw new Error(
          "We couldn't initialize payment setup. Please refresh and try again."
        );
      } else {
        // Stripe is not configured yet — still let the user sign in.
        const params = new URLSearchParams({
          plan: selectedPlan.slug,
          cycle,
          email,
          newAccount: "1",
        });
        router.push(`/login?${params.toString()}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed.");
      setLoading(false);
    }
  };

  const handleResumeSetup = async () => {
    if (!resumeToken) return;
    setResumingSetup(true);
    setError("");
    try {
      const res = await fetch("/api/auth/onboarding/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resumeToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error || "Unable to continue payment setup right now."
        );
      }
      try {
        window.sessionStorage.setItem(
          "restenzo_onboarding_ctx",
          JSON.stringify(data)
        );
      } catch {
        // Recovery fallback handled by the onboarding page.
      }
      router.push("/onboarding");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to continue payment setup right now."
      );
    } finally {
      setResumingSetup(false);
    }
  };

  return (
    <main className="site-scope min-h-screen grid lg:grid-cols-12 bg-white dark:bg-[#05070d] text-gray-900 dark:text-gray-100">
      <SiteBodyClass />

      {/* Left — Form */}
      <section className="lg:col-span-7 xl:col-span-7 relative flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <Logo size="md" />
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">
              Already have an account?
            </span>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-[#ff5a1f] hover:underline"
            >
              Sign in
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <ThemeToggle />
          </div>
        </div>

        <div className="flex-1 flex items-center py-10">
          <div className="w-full max-w-xl">
            <div className="animate-[fadeInUp_0.6s_ease-out_both]">
              <span className="inline-flex items-center px-3 py-1 rounded-full border border-[#ff5a1f]/25 bg-[#ff5a1f]/10 text-[#ff5a1f] text-xs font-semibold tracking-wide">
                14 day free trial · Billing starts after trial
              </span>
              <h1 className="mt-5 text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                Create your Restenzo account
              </h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Start in minutes. Pick your setup and we’ll tailor Restenzo to
                your restaurant.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="mt-8 space-y-5 animate-[fadeInUp_0.7s_ease-out_both]"
              style={{ animationDelay: "0.1s" }}
            >
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-300 text-sm rounded-xl px-4 py-3"
                >
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  {error}
                </div>
              )}
              {resumeToken && (
                <button
                  type="button"
                  onClick={handleResumeSetup}
                  disabled={resumingSetup}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-[#ff5a1f]/30 text-[#ff5a1f] font-semibold hover:bg-[#ff5a1f]/5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {resumingSetup ? "Opening payment setup…" : "Continue payment setup"}
                </button>
              )}

              {/* Restaurant type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  What best describes your business?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      {
                        id: "SINGLE" as const,
                        icon: Store,
                        title: "Single branch",
                        desc: "One location",
                      },
                      {
                        id: "MULTI" as const,
                        icon: Building2,
                        title: "Multi branch",
                        desc: "Head office + branches",
                      },
                    ]
                  ).map((opt) => {
                    const selected = restaurantType === opt.id;
                    return (
                      <button
                        type="button"
                        key={opt.id}
                        onClick={() => setRestaurantType(opt.id)}
                        className={`text-left rounded-xl border-2 p-4 transition-all ${
                          selected
                            ? "border-[#ff5a1f] bg-[#ff5a1f]/5"
                            : "border-gray-200 dark:border-white/10 hover:border-[#ff5a1f]/50"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div
                            className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                              selected
                                ? "bg-gradient-brand text-white"
                                : "bg-[#ff5a1f]/10 text-[#ff5a1f]"
                            }`}
                          >
                            <opt.icon className="h-4 w-4" />
                          </div>
                          {selected && (
                            <CheckCircle2 className="h-5 w-5 text-[#ff5a1f]" />
                          )}
                        </div>
                        <p className="mt-3 text-sm font-semibold text-gray-900 dark:text-white">
                          {opt.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {opt.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Full name
                  </label>
                  <div className="relative group">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-[#ff5a1f] transition-colors" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Sana Ali"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:border-[#ff5a1f] transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Restaurant name
                  </label>
                  <div className="relative group">
                    <Utensils className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-[#ff5a1f] transition-colors" />
                    <input
                      type="text"
                      required
                      value={restaurantName}
                      onChange={(e) => setRestaurantName(e.target.value)}
                      placeholder="Saffron House"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:border-[#ff5a1f] transition-all"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Work email
                </label>
                <div className="relative group">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-[#ff5a1f] transition-colors" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@restaurant.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:border-[#ff5a1f] transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative group">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-[#ff5a1f] transition-colors" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="w-full pl-10 pr-11 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:border-[#ff5a1f] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#ff5a1f] transition-colors"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {/* Strength meter */}
                  <div className="mt-2 flex gap-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                          i < strength
                            ? strength <= 1
                              ? "bg-red-400"
                              : strength === 2
                                ? "bg-amber-400"
                                : strength === 3
                                  ? "bg-lime-400"
                                  : "bg-emerald-500"
                            : "bg-gray-200 dark:bg-white/10"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Confirm password
                  </label>
                  <div className="relative group">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-[#ff5a1f] transition-colors" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:border-[#ff5a1f] transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Billing cycle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Billing cycle
                </label>
                <div className="inline-grid grid-cols-2 relative items-center rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-1 min-w-[280px]">
                  <button
                    type="button"
                    onClick={() => setCycle("monthly")}
                    className={`relative z-10 w-full px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
                      cycle === "monthly"
                        ? "text-white"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setCycle("yearly")}
                    className={`relative z-10 w-full px-4 py-1.5 text-sm font-semibold rounded-full transition-colors flex items-center justify-center gap-1.5 ${
                      cycle === "yearly"
                        ? "text-white"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    Yearly
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                        cycle === "yearly"
                          ? "bg-white/25 text-white"
                          : "bg-[#ff5a1f]/10 text-[#ff5a1f]"
                      }`}
                    >
                      -{YEARLY_DISCOUNT_PERCENT}%
                    </span>
                  </button>
                  <span
                    aria-hidden
                    className={`absolute left-1 top-1 bottom-1 w-[calc((100%-0.5rem)/2)] rounded-full bg-gradient-brand transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      cycle === "yearly" ? "translate-x-full" : "translate-x-0"
                    }`}
                  />
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#ff5a1f] focus:ring-[#ff5a1f]"
                />
                <span>
                  I agree to the{" "}
                  <Link
                    href="/terms"
                    className="text-[#ff5a1f] font-semibold hover:underline"
                  >
                    Terms
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/privacy"
                    className="text-[#ff5a1f] font-semibold hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-brand text-white font-semibold shadow-[0_20px_40px_-15px_rgba(255,90,31,0.65)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <svg
                    className="animate-spin h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                ) : (
                  <>
                    Continue to add payment method
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                No charge today. You&apos;ll add a card next so billing can start
                automatically after your 14 day free trial.
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* Right — Order summary / plan recap */}
      <aside className="hidden lg:flex lg:col-span-5 xl:col-span-5 relative flex-col p-10 xl:p-14 bg-gradient-brand text-white overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-white/15 blur-3xl animate-blob"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -right-24 h-[24rem] w-[24rem] rounded-full bg-white/10 blur-3xl animate-blob"
          style={{ animationDelay: "-4s" }}
        />

        <div className="relative">
          <p className="text-xs font-semibold tracking-[0.22em] uppercase text-white/80">
            Your setup
          </p>
          <h2 className="mt-3 text-3xl xl:text-4xl font-extrabold tracking-tight leading-[1.1]">
            A smooth start for your restaurant.
          </h2>
        </div>

        <div className="relative mt-10 rounded-3xl bg-white text-gray-900 p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold tracking-wider uppercase text-[#ff5a1f]">
                {selectedPlan.name} plan
              </p>
              <p className="mt-1 text-sm text-gray-500">{selectedPlan.description}</p>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#ff5a1f]/10 text-[#ff5a1f] text-[11px] font-bold">
              {cycle === "yearly" ? "Yearly" : "Monthly"}
            </span>
          </div>

          <div className="mt-6 flex items-baseline gap-1.5">
            <span className="text-5xl font-extrabold tracking-tight text-gray-900">
              ${price}
            </span>
            <span className="text-gray-500">/ month</span>
          </div>
          {cycle === "yearly" && (
            <p className="text-xs text-gray-500 mt-1">
              Billed annually at ${selectedPlan.yearlyPrice * 12}.
            </p>
          )}

          <div className="mt-6 pt-6 border-t border-gray-100 space-y-2.5">
            {selectedPlan.features.slice(0, 5).map((f) => (
              <div
                key={f}
                className="flex items-start gap-2.5 text-sm text-gray-700"
              >
                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#ff5a1f]/10 text-[#ff5a1f]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </span>
                {f}
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-500">Due today</span>
            <span className="font-bold text-gray-900">$0.00</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            14 day free trial cancel anytime.
          </p>
        </div>

        <div className="relative mt-auto pt-10 text-sm text-white/90 space-y-2">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Free onboarding & data migration
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Switch plans or cancel anytime
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Secured with bank level encryption
          </p>
        </div>
      </aside>
    </main>
  );
}

export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          Loading…
        </div>
      }
    >
      <SignUpInner />
    </Suspense>
  );
}
