"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { joinClassNames } from "./card-utils";
import TagPill from "./TagPill";

export interface TagPillButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> {
  children: ReactNode;
  className?: string;
  textClassName?: string;
}

export default function TagPillButton({
  children,
  className = "",
  textClassName = "truncate whitespace-nowrap",
  type = "button",
  ...buttonProps
}: TagPillButtonProps) {
  return (
    <button
      type={type}
      className={joinClassNames(
        "rounded-full transition hover:-translate-y-px focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:hover:translate-y-0",
        className,
      )}
      {...buttonProps}
    >
      <TagPill
        className="text-slate-800 transition hover:border-sky-300 hover:bg-sky-50"
        textClassName={textClassName}
        disabled={buttonProps.disabled}
      >
        {children}
      </TagPill>
    </button>
  );
}
