"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { joinClassNames } from "./card-utils";
import { getToolbarActionClassName, type ActionButtonSize } from "./toolbar-styles";

export interface CommandButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "size"> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  size?: ActionButtonSize;
  className?: string;
}

export function CommandButton({
  children,
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...buttonProps
}: CommandButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={joinClassNames(getToolbarActionClassName(variant, size), className)}
    >
      {children}
    </button>
  );
}

export default CommandButton;
