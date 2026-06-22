"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { joinClassNames } from "./card-utils";
import { getTagPillClassName } from "./FormStyles";

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
        getTagPillClassName("text-xs text-slate-800 transition hover:-translate-y-px hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:translate-y-0"),
        className,
      )}
      {...buttonProps}
    >
      <span className={joinClassNames("block max-w-full", textClassName)}>{children}</span>
    </button>
  );
}
