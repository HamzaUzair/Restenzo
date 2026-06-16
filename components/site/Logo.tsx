import React from "react";
import Link from "next/link";

interface LogoProps {
  href?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "mono";
  /** When false, only the brand mark is rendered (no wordmark). */
  showText?: boolean;
  /** Override the default "Restenzo" wordmark. */
  text?: string;
}

const sizeMap = {
  sm: { box: "h-7 w-7", text: "text-lg", dot: "h-1.5 w-1.5" },
  md: { box: "h-9 w-9", text: "text-xl", dot: "h-2 w-2" },
  lg: { box: "h-12 w-12", text: "text-2xl", dot: "h-2.5 w-2.5" },
};

const Logo: React.FC<LogoProps> = ({
  href = "/",
  size = "md",
  variant = "default",
  showText = true,
  text = "Restenzo",
}) => {
  const s = sizeMap[size];
  const content = (
    <span className="flex items-center gap-2.5 group">
      <span
        className={`${s.box} relative rounded-xl bg-gradient-brand shadow-[0_10px_30px_-8px_rgba(255,90,31,0.55)] flex items-center justify-center overflow-hidden transition-transform duration-500 group-hover:rotate-[8deg]`}
      >
        {/* abstract plate + steam mark */}
        <svg
          viewBox="0 0 24 24"
          className="w-[60%] h-[60%] text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 14c0-4 3.6-7 8-7s8 3 8 7" />
          <path d="M3 14h18" />
          <path d="M12 4c-.7 1-.7 2 0 3" />
          <path d="M9 4c-.5.8-.5 1.6 0 2.4" />
          <path d="M15 4c-.5.8-.5 1.6 0 2.4" />
        </svg>
        <span
          className={`absolute top-1 right-1 ${s.dot} rounded-full bg-white/90 animate-pulse`}
        />
      </span>
      {showText && (
        <span
          className={`font-bold tracking-tight ${s.text} ${
            variant === "mono"
              ? "text-white"
              : "text-gray-900 dark:text-white"
          }`}
        >
          {text}
        </span>
      )}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} aria-label="Restenzo — Home">
      {content}
    </Link>
  );
};

export default Logo;
