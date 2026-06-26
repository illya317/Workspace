"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { getFieldValueClassName } from "./FormStyles";
import FieldInputShell, { type FieldInputShellProps } from "./FieldInputShell";
import type { FieldControlSize } from "./FormStyles";

export interface ReadOnlyFieldProps {
  value?: ReactNode;
  children?: ReactNode;
  placeholder?: ReactNode;
  variant?: "default" | "plain";
  className?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
  size?: FieldControlSize;
  density?: FieldInputShellProps["density"];
  style?: CSSProperties;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
}

const INNER_CLASS_NAME =
  "flex h-full w-full min-w-0 items-center border-0 bg-transparent p-0 text-left text-sm leading-none text-current outline-none";

export function ReadOnlyField({
  value,
  children,
  placeholder,
  variant = "default",
  className = "",
  disabled,
  title,
  "aria-label": ariaLabel,
  size = "md",
  density = "normal",
  style,
  onClick,
}: ReadOnlyFieldProps) {
  const content = children ?? value;
  const body = content === "" || content === null || content === undefined
    ? placeholder ?? <span className="text-slate-400">未设置</span>
    : content;

  if (variant === "plain") {
    return (
      <div title={title} aria-label={ariaLabel} className={getFieldValueClassName(className)}>
        {body}
      </div>
    );
  }

  return (
    <FieldInputShell readOnly disabled={disabled} size={size} density={density} className={className} style={style}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          title={title}
          aria-label={ariaLabel}
          className={INNER_CLASS_NAME}
        >
          {body}
        </button>
      ) : (
        <div title={title} aria-label={ariaLabel} className={`${INNER_CLASS_NAME} truncate`}>
          {body}
        </div>
      )}
    </FieldInputShell>
  );
}

export default ReadOnlyField;
