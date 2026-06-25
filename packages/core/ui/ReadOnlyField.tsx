"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { getReadOnlyFieldClassName } from "./FormStyles";
import { joinClassNames } from "./card-utils";

export interface ReadOnlyFieldProps {
  value?: ReactNode;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
}

export function ReadOnlyField({
  value,
  children,
  className = "",
  disabled,
  title,
  "aria-label": ariaLabel,
  onClick,
}: ReadOnlyFieldProps) {
  const content = children ?? value;
  const cls = joinClassNames(getReadOnlyFieldClassName(), className);
  if (onClick) {
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
