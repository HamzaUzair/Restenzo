"use client";

import React, { useState } from "react";
import { Mail, Phone, MapPin, MessageCircle, Send, CheckCircle2 } from "lucide-react";
import Container from "@/components/site/Container";
import Reveal from "@/components/site/Reveal";

const channels = [
  {
    icon: Mail,
    title: "Email Us",
    value: "hello@restenzo.com",
    desc: "Our team replies within one business day.",
  },
  {
    icon: Phone,
    title: "Call us",
    value: "03026271991",
    desc: "Mon – Fri, 9:00 – 18:00 UTC",
  },
  {
    icon: MessageCircle,
    title: "Live chat",
    value: "Inside the product",
    desc: "Instant help for paying customers.",
  },
  {
    icon: MapPin,
    title: "HQ",
    value: "Global remote first",
    desc: "Restaurants in 40+ countries.",
  },
];

export default function ContactPage() {
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Submission is wired through your own backend later.
    setSent(true);
  };

  return (
    <>
      <section className="relative overflow-hidden pt-20 pb-10 lg:pt-28">
        <div className="absolute inset-0 bg-gradient-brand-soft -z-10" />
        <div className="absolute inset-0 grid-pattern -z-10 opacity-50" />
        <Container>
          <Reveal className="max-w-3xl mx-auto text-center">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#ff5a1f]/25 bg-[#ff5a1f]/10 text-[#ff5a1f] text-xs font-semibold tracking-wide">
              Contact
            </span>
            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-[1.07]">
              Let’s talk about{" "}
              <span className="text-gradient-brand">your restaurant.</span>
            </h1>
            <p className="mt-5 text-lg text-gray-600 dark:text-gray-400">
              Whether you run one café or fifty, our team is here to help you
              get started with Restenzo.
            </p>
          </Reveal>
        </Container>
      </section>

      <section className="py-16 lg:py-20">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Form */}
            <Reveal className="lg:col-span-7">
              <div className="rounded-3xl border border-gray-100 dark:border-white/10 bg-white dark:bg-white/[0.02] p-8 lg:p-10">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Send us a message
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  We usually reply within one business day.
                </p>

                {sent ? (
                  <div className="mt-8 rounded-2xl bg-[#ff5a1f]/10 border border-[#ff5a1f]/30 text-[#ff5a1f] p-6 flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 mt-0.5" />
                    <div>
                      <p className="font-semibold">Thanks message received.</p>
                      <p className="text-sm mt-1 text-gray-700 dark:text-gray-300">
                        Our team will get back to you shortly.
                      </p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Full name
                      </label>
                      <input
                        required
                        className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:border-[#ff5a1f]"
                        placeholder="Sana Ali"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Work email
                      </label>
                      <input
                        required
                        type="email"
                        className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:border-[#ff5a1f]"
                        placeholder="sana@restaurant.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Restaurant name
                      </label>
                      <input
                        className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:border-[#ff5a1f]"
                        placeholder="Saffron House"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        I run…
                      </label>
                      <select className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:border-[#ff5a1f]">
                        <option>A single branch</option>
                        <option>A multi branch chain</option>
                        <option>An enterprise group</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        How can we help?
                      </label>
                      <textarea
                        rows={5}
                        className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:border-[#ff5a1f]"
                        placeholder="Tell us about your operations, your current tooling and what you’re looking to improve."
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-brand text-white font-semibold shadow-[0_20px_40px_-15px_rgba(255,90,31,0.65)] hover:-translate-y-0.5 transition-transform"
                      >
                        Send message
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </Reveal>

            {/* Channels */}
            <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-4 content-start">
              {channels.map((c, i) => (
                <Reveal
                  key={c.title}
                  delay={i * 80}
                  className="rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 card-hover"
                >
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#ff5a1f]/10 text-[#ff5a1f]">
                    <c.icon className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-gray-900 dark:text-white">
                    {c.title}
                  </p>
                  <p className="mt-0.5 text-base font-semibold text-[#ff5a1f]">
                    {c.value}
                  </p>
                  <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                    {c.desc}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
