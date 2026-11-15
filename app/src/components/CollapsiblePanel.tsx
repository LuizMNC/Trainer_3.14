"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface CollapsiblePanelProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (next: boolean) => void;
  tone?: "blue" | "red" | "neutral";
  className?: string;
  bodyClassName?: string;
  children?: React.ReactNode;
}

export function CollapsiblePanel({
  title,
  subtitle,
  badge,
  icon,
  defaultOpen = false,
  open: controlledOpen,
  onToggle,
  tone = "neutral",
  className = "",
  bodyClassName = "",
  children,
}: CollapsiblePanelProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const handleToggle = () => {
    const next = !isOpen;
    if (controlledOpen === undefined) setInternalOpen(next);
    onToggle?.(next);
  };

  const borderTone =
    tone === "red"
      ? "border-[#DC2626]/40"
      : tone === "blue"
        ? "border-[#2563EB]/45"
        : "border-[#1E293B]";

  const accentText =
    tone === "red"
      ? "text-[#F87171]"
      : tone === "blue"
        ? "text-[#60A5FA]"
        : "text-[#94A3B8]";

  return (
    <section
      className={`rounded-2xl bg-[#0A0E17]/95 border ${borderTone} shadow-lg overflow-hidden ${className}`}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={handleToggle}
        className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left bg-[#090D16] hover:bg-[#111827] transition-colors touch-manipulation"
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className={`shrink-0 ${accentText}`}>{icon}</span>}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#F8FAFC] truncate">
                {title}
              </span>
              {badge}
            </div>
            {subtitle && (
              <p className="text-[0.6875rem] text-[#94A3B8] truncate mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        <span className={`shrink-0 flex items-center gap-1 text-[0.6875rem] font-semibold ${accentText}`}>
          <span className="hidden sm:inline">{isOpen ? "Recolher" : "Expandir"}</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>
      {isOpen && (
        <div className={`border-t border-[#1E293B] p-3.5 ${bodyClassName}`}>
          {children}
        </div>
      )}
    </section>
  );
}
