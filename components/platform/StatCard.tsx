"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  /** Tailwind classes for the icon pill (text color + bg). */
  tint: string;
  hint?: string;
  href?: string;
  trend?: {
    direction: "up" | "down" | "flat";
    label: string;
  };
}

/**
 * Platform Admin KPI card. Used across Dashboard, Subscriptions,
 * Billing, Setup Health and Support to give the whole panel a single,
 * premium visual language.
 */
const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  tint,
  hint,
  href,
  trend,
}) => {
  const body = (
    <>
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
          {label}
        </p>
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-gray-900 dark:text-slate-100">
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {trend && (
          <span
            className={
              trend.direction === "up"
                ? "font-medium text-emerald-600"
                : trend.direction === "down"
                ? "font-medium text-rose-600"
                : "font-medium text-gray-500 dark:text-slate-400"
            }
          >
            {trend.label}
          </span>
        )}
        {hint && <span className="text-gray-400 dark:text-slate-500">{hint}</span>}
      </div>
    </>
  );

  const className =
    "group relative block rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 dark:border-[#1f2a3d] dark:!bg-[#0b1220] dark:shadow-[0_12px_30px_-18px_rgba(0,0,0,0.75)]";

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
        <ArrowUpRight
          size={14}
          className="absolute right-4 top-4 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-slate-500"
        />
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
};

export default StatCard;
