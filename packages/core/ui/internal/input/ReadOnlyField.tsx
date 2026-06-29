"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { getFieldValueClassName } from "../form/FormStyles";
import FieldInputShell, { type FieldInputShellProps } from "./FieldInputShell";
import type { FieldControlSize } from "../form/FormStyles";
import { joinClassNames } from "../common/card-utils";
import { useFieldContext } from "./field-context";

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
  textAlign?: "left" | "center" | "right";
  fontRole?: "default" | "mono";
  tone?: "default" | "muted";
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
  size,
  density,
  style,
  onClick,
  textAlign = "left",
  fontRole = "default",
  tone = "default",
}: ReadOnlyFieldProps) {
  const fieldContext = useFieldContext();
  const resolvedSize = size ?? fieldContext?.size ?? "md";
  const resolvedDensity = density ?? fieldContext?.density ?? "normal";
  const content = children ?? value;
  const body = content === "" || content === null || content === undefined
    ? placeholder ?? <span className="text-slate-400">未设置</span>
    : content;

  const alignClass = textAlign === "center" ? "text-center" : textAlign === "right" ? "text-right" : "text-left";
  const fontClass = fontRole === "mono" ? "font-mono" : "";
  const toneClass = tone === "muted" ? "text-gray-700" : "";

  if (variant === "plain") {
    return (
      <div title={title} aria-label={ariaLabel} className={getFieldValueClassName(joinClassNames(alignClass, fontClass, toneClass, className))}>
        {body}
      </div>
    );
  }

  return (
    <FieldInputShell readOnly disabled={disabled} size={resolvedSize} density={resolvedDensity} className={joinClassNames(fontClass, toneClass, className)} style={style}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          title={title}
          aria-label={ariaLabel}
          className={joinClassNames(INNER_CLASS_NAME, alignClass)}
        >
          {body}
        </button>
      ) : (
        <div title={title} aria-label={ariaLabel} className={joinClassNames(INNER_CLASS_NAME, "truncate", alignClass)}>
          {body}
        </div>
      )}
    </FieldInputShell>
  );
}

export default ReadOnlyField;
