"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { joinClassNames } from "./card-utils";
import { getToolbarActionClassName, type ActionButtonSize } from "./toolbar-styles";

export interface CommandButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "size"> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  size?: ActionButtonSize;
  className?: string;
  /** 子节点为字符串时自动截断并 hover 显示全文 */
  truncate?: boolean;
}

export function CommandButton({
  children,
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  truncate = false,
  ...buttonProps
}: CommandButtonProps) {
  const content = truncate && typeof children === "string" ? (
    <span className="min-w-0 truncate" title={children}>
      {children}
    </span>
  ) : children;
  return (
    <button
      {...buttonProps}
      type={type}
      className={joinClassNames(getToolbarActionClassName(variant, size), className)}
    >
      {content}
    </button>
  );
}

export default CommandButton;
