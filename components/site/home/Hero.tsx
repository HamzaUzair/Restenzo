import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import Container from "../Container";
import DashboardMockup from "./DashboardMockup";

const Hero: React.FC = () => {
  return (
    <section className="relative overflow-hidden pt-16 pb-24 lg:pt-24 lg:pb-32">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-brand-soft -z-10" />
      <div className="absolute inset-0 grid-pattern -z-10 opacity-60" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 h-[28rem] w-[28rem] rounded-full bg-[#ff5a1f]/20 blur-3xl animate-blob -z-10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -right-24 h-[24rem] w-[24rem] rounded-full bg-[#ff8a3d]/20 blur-3xl animate-blob -z-10"
        style={{ animationDelay: "-6s" }}
      />

      <Container>
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
          <span
            className="inline-flex items-center px-3.5 py-1.5 rounded-full border border-[#ff5a1f]/25 bg-[#ff5a1f]/10 text-[#ff5a1f] text-xs font-semibold tracking-wide animate-[fadeInDown_0.8s_ease-out_both]"
          >
            Restaurant Operations, Reimagined
          </span>

          <h1
            className="mt-6 text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-[1.05] animate-[fadeInUp_0.9s_ease-out_both]"
            style={{ animationDelay: "0.1s" }}
          >
            Run your restaurant like
            <br className="hidden sm:inline" />{" "}
            <span className="text-gradient-brand">a well oiled machine.</span>
          </h1>

          <p
            className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl animate-[fadeInUp_0.9s_ease-out_both]"
            style={{ animationDelay: "0.2s" }}
          >
            Restenzo is the all in one SaaS platform for single and multi branch
            restaurants orders, live kitchen, cashier, expenses, day end and
            analytics, all in one beautifully crafted product.
          </p>

          <div
            className="mt-9 flex flex-col sm:flex-row items-center gap-3 animate-[fadeInUp_0.9s_ease-out_both]"
            style={{ animationDelay: "0.3s" }}
          >
            <Link
              href="/signup"
              className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-brand text-white font-semibold shadow-[0_20px_40px_-15px_rgba(255,90,31,0.65)] hover:shadow-[0_24px_55px_-15px_rgba(255,90,31,0.85)] hover:-translate-y-0.5 transition-all duration-300"
            >
              Start free trial
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur-sm text-gray-900 dark:text-white font-semibold hover:border-[#ff5a1f]/40 hover:text-[#ff5a1f] transition-colors"
            >
              View pricing
            </Link>
          </div>

          <ul
            className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-600 dark:text-gray-400 animate-[fadeInUp_0.9s_ease-out_both]"
            style={{ animationDelay: "0.4s" }}
          >
            <li className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-[#ff5a1f]" />
              14 day free trial
            </li>
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-[#ff5a1f]" />
              Bank level security
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-[#ff5a1f]" />
              Set up in under 10 minutes
            </li>
          </ul>
        </div>

        {/* Hero visual */}
        <div
          className="mt-16 lg:mt-20 relative animate-[fadeInUp_1s_ease-out_both]"
          style={{ animationDelay: "0.5s" }}
        >
          <div className="absolute inset-x-10 -top-10 h-40 bg-gradient-to-b from-[#ff5a1f]/30 to-transparent blur-2xl -z-10" />
          <DashboardMockup />
        </div>
      </Container>
    </section>
  );
};

export default Hero;
