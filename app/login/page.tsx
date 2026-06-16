"use client";

import React, { Suspense, useState, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Zap,
} from "lucide-react";
import Logo from "@/components/site/Logo";
import ThemeToggle from "@/components/theme/ThemeToggle";
import SiteBodyClass from "@/components/site/SiteBodyClass";
import { apiFetch, getAuthSession, setAuthSession } from "@/lib/auth-client";
import type { AuthSession } from "@/types/auth";

type LoginErrorPayload = {
  error?: string;
  errorCode?: string;
  nextAction?: string;
  resumeToken?: string;
  resumeEmail?: string;
};

function getDefaultRouteByRole(role: AuthSession["role"]) {
  if (role === "ORDER_TAKER") return "/create-order";
  if (role === "LIVE_KITCHEN") return "/kitchen";
  if (role === "CASHIER") return "/orders";
  if (role === "ACCOUNTANT") return "/sales-list";
  if (role === "SUPER_ADMIN") return "/dashboard";
  if (role === "RESTAURANT_ADMIN") return "/dashboard";
  if (role === "BRANCH_ADMIN") return "/dashboard";
  return "/dashboard";
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillEmail = searchParams.get("email") ?? "";
  const isNewAccount = searchParams.get("newAccount") === "1";
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResumingSetup, setIsResumingSetup] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const session = getAuthSession();
      if (session) {
        router.replace(getDefaultRouteByRole(session.role));
      }
    }
  }, [router]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setErrorCode(null);
    setResumeToken(null);
    setIsLoading(true);

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: email,
          password,
        }),
      });
      const data = (await res.json()) as AuthSession & LoginErrorPayload;
      if (!res.ok) {
        setError(data.error || "Invalid username/email or password");
        setErrorCode(data.errorCode ?? null);
        setResumeToken(data.resumeToken ?? null);
        setIsLoading(false);
        return;
      }

      const session = data as AuthSession;
      setAuthSession(session);
      router.push(getDefaultRouteByRole(session.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setIsLoading(false);
    }
  };

  const handleResumeSetup = async () => {
    if (!resumeToken) return;
    setIsResumingSetup(true);
    setError("");

    try {
      const res = await apiFetch("/api/auth/onboarding/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resumeToken }),
      });
      const data = (await res.json()) as
        | {
            restaurantId: number;
            userId: number;
            email: string;
            planId: string;
            cycle: "monthly" | "yearly";
            trialEnd: string | null;
            clientSecret: string;
            publishableKey: string | null;
          }
        | LoginErrorPayload;
      if (!res.ok) {
        throw new Error(
          (data as LoginErrorPayload).error ||
            "Unable to resume payment setup right now."
        );
      }
      try {
        window.sessionStorage.setItem(
          "restenzo_onboarding_ctx",
          JSON.stringify(data)
        );
      } catch {
        // If sessionStorage is unavailable, the onboarding page will show
        // a recovery prompt and the user can retry.
      }
      router.push("/onboarding");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to resume payment setup right now."
      );
    } finally {
      setIsResumingSetup(false);
    }
  };

  return (
    <main className="site-scope min-h-screen grid lg:grid-cols-2 bg-white dark:bg-[#05070d] text-gray-900 dark:text-gray-100">
      <SiteBodyClass />

      {/* Left — Brand panel */}
      <aside className="relative hidden lg:flex flex-col justify-between p-10 xl:p-14 bg-gradient-brand text-white overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-white/15 blur-3xl animate-blob"
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -right-24 h-[24rem] w-[24rem] rounded-full bg-white/10 blur-3xl animate-blob"
          style={{ animationDelay: "-5s" }}
        />

        <div className="relative">
          <Logo href="/" variant="mono" size="md" />
        </div>

        <div className="relative max-w-md">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/15 text-white text-xs font-semibold tracking-wide">
            Welcome back
          </span>
          <h1 className="mt-5 text-4xl xl:text-5xl font-extrabold tracking-tight leading-[1.08]">
            Run your restaurant with calm precision.
          </h1>
          <p className="mt-4 text-white/90 text-base leading-relaxed">
            Sign in to access orders, live kitchen, cashier, reports and every
            tool your team relies on all in one place.
          </p>
          <ul className="mt-6 space-y-2.5 text-sm text-white/90">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Single sign-on for every role on your team
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Encrypted end to end, audited on every action
            </li>
            <li className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Instant access to orders & live kitchen
            </li>
          </ul>
        </div>

        <div className="relative text-xs text-white/80">
          © {new Date().getFullYear()} Restenzo built for modern restaurants.
        </div>
      </aside>

      {/* Right — Form */}
      <section className="relative flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <Logo size="sm" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">
              New to Restenzo?
            </span>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-[#ff5a1f] hover:underline"
            >
              Create account
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <ThemeToggle />
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-md">
            <div className="animate-[fadeInUp_0.6s_ease-out_both]">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white">
                Sign in to Restenzo
              </h2>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Welcome back. Enter your credentials to continue.
              </p>
            </div>

            {isNewAccount && (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="inline h-4 w-4 mr-1" />
                Your account is ready. Sign in to access your portal.
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="mt-8 space-y-5 animate-[fadeInUp_0.7s_ease-out_both]"
              style={{ animationDelay: "0.1s" }}
            >
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-300 text-sm rounded-xl px-4 py-3 animate-[fadeInDown_0.3s_ease-out_both]"
                >
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  {error}
                </div>
              )}
              {errorCode === "ONBOARDING_INCOMPLETE" && resumeToken && (
                <button
                  type="button"
                  onClick={handleResumeSetup}
                  disabled={isResumingSetup}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-[#ff5a1f]/30 text-[#ff5a1f] font-semibold hover:bg-[#ff5a1f]/5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isResumingSetup ? "Opening payment setup…" : "Complete payment setup"}
                </button>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Email or username
                </label>
                <div className="relative group">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-[#ff5a1f] transition-colors" />
                  <input
                    type="text"
                    autoComplete="username"
                    required
                    placeholder="you@restaurant.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError("");
                    }}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:border-[#ff5a1f] transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Password
                  </label>
                  <Link
                    href="#"
                    className="text-xs font-semibold text-[#ff5a1f] hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-[#ff5a1f] transition-colors" />
                  <input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError("");
                    }}
                    className="w-full pl-10 pr-11 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:border-[#ff5a1f] transition-all"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#ff5a1f] transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#ff5a1f] focus:ring-[#ff5a1f]"
                />
                Keep me signed in on this device
              </label>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-brand text-white font-semibold shadow-[0_20px_40px_-15px_rgba(255,90,31,0.65)] hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
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
                    Sign in
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400 lg:hidden">
              New to Restenzo?{" "}
              <Link
                href="/signup"
                className="font-semibold text-[#ff5a1f] hover:underline"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-500">
          Loading…
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
