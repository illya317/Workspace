"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { getFieldValueClassName, getReadOnlyFieldClassName } from "./FormStyles";
import { joinClassNames } from "./card-utils";

export interface ReadOnlyFieldProps {
  value?: ReactNode;
  children?: ReactNode;
  placeholder?: ReactNode;
  variant?: "default" | "plain";
  className?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
}

export function ReadOnlyField({
  value,
  children,
  placeholder,
  variant = "default",
  className = "",
  disabled,
  title,
  "aria-label": ariaLabel,
  onClick,
}: ReadOnlyFieldProps) {
  let content = children ?? value;
  if (content === "" || content === null || content === undefined) {
    content = placeholder ?? <span className="text-slate-400">未设置</span>;
  }
  const cls = joinClassNames(
    variant === "plain" ? getFieldValueClassName() : getReadOnlyFieldClassName(),
    className,
  );
  if (onClick && variant !== "plain") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        className={cls}
      >
        {content}
      </button>
    );
  }
  return (
    <div title={title} aria-label={ariaLabel} className={cls}>
      {content}
    </div>
  );
}

export default ReadOnlyField;
