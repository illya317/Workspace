"use client";

import type { ReactNode } from "react";
import { getTagPillClassName } from "../form/FormStyles";
import { joinClassNames } from "../common/card-utils";

export interface TagPillProps {
  children: ReactNode;
  className?: string;
  textClassName?: string;
  title?: string;
  /** 文本最大字符数，超出后截断并加省略号；<=0 时不做字符截断。默认 8。 */
  maxLength?: number;
  action?: ReactNode;
  disabled?: boolean;
}

function truncateText(text: string, maxLength: number) {
  if (maxLength <= 0 || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export default function TagPill({
  children,
  className = "",
  textClassName = "truncate whitespace-nowrap",
  title,
  maxLength = 8,
  action,
  disabled = false,
}: TagPillProps) {
  const text = typeof children === "string" ? children : null;
  const displayText = text ? truncateText(text, maxLength) : children;
  const displayTitle = title ?? (text || undefined);

  return (
    <span
      title={displayTitle}
      className={joinClassNames(
        getTagPillClassName(),
        disabled ? "text-slate-400" : "",
        className,
      )}
    >
      <span className={joinClassNames("block max-w-full", textClassName)}>
        {displayText}
      </span>
      {action}
    </span>
  );
}
