"use client";

import React from "react";
import Link from "next/link";
import {
  Facebook,
  Instagram,
  Linkedin,
  Twitter,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import Logo from "./Logo";
import Container from "./Container";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Book a demo", href: "/contact" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "FAQ", href: "/faq" },
      { label: "Careers", href: "/about#careers" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Security", href: "/privacy#security" },
      { label: "Cookies", href: "/privacy#cookies" },
    ],
  },
];

const socials = [
  { icon: Twitter, href: "#", label: "Twitter" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
  { icon: Facebook, href: "#", label: "Facebook" },
  { icon: Instagram, href: "#", label: "Instagram" },
];

const Footer: React.FC = () => {
  return (
    <footer className="site-scope relative mt-24 border-t border-gray-200/80 dark:border-white/10 bg-white dark:bg-[#05070d]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#ff5a1f]/40 to-transparent" />
      <Container>
        <div className="py-14 lg:py-20 grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-4">
            <Logo />
            <p className="mt-4 text-sm leading-relaxed text-gray-600 dark:text-gray-400 max-w-sm">
              The all in one restaurant management platform built for modern
              operators. From a single branch to a national chain Restenzo
              scales with you.
            </p>

            <ul className="mt-6 space-y-2.5 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 text-[#ff5a1f]" />
                recteenoshorts@gmail.com
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-[#ff5a1f]" />
               03026271991
              </li>
              <li className="flex items-center gap-2.5">
                <MapPin className="h-4 w-4 text-[#ff5a1f]" />
                Global remote first
              </li>
            </ul>

            <div className="mt-6 flex items-center gap-2">
              {socials.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:text-[#ff5a1f] hover:border-[#ff5a1f]/40 transition-colors"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title} className="md:col-span-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white tracking-wide">
                {col.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#ff5a1f] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="md:col-span-2">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white tracking-wide">
              Newsletter
            </h4>
            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
              Product updates, restaurant operations tips, and more.
            </p>
            <form
              className="mt-4 flex flex-col gap-2"
              onSubmit={(e) => e.preventDefault()}
            >
              <input
                type="email"
                placeholder="you@restaurant.com"
                className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f]/40 focus:border-[#ff5a1f]"
              />
              <button
                type="submit"
                className="rounded-lg bg-gradient-brand text-white text-sm font-semibold py-2 hover:-translate-y-px transition-transform"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>

        <div className="border-t border-gray-200/80 dark:border-white/10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
          <p>© {new Date().getFullYear()} Restenzo. All rights reserved.</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-[#ff5a1f] transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[#ff5a1f] transition-colors">
              Terms
            </Link>
            <Link href="/contact" className="hover:text-[#ff5a1f] transition-colors">
              Contact
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
};

export default Footer;
