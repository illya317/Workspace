"use client";

import type { ReactNode } from "react";
import { Button, type ButtonProps } from "antd";
import type { ActionButtonSize } from "../toolbar/toolbar-styles";

export interface CommandButtonProps extends Omit<ButtonProps, "children" | "color" | "danger" | "htmlType" | "size" | "type" | "variant"> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  size?: ActionButtonSize;
  className?: string;
  type?: "button" | "submit" | "reset";
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
    <Button
      {...buttonProps}
      className={className}
      danger={variant === "danger"}
      htmlType={type}
      size={size === "sm" ? "small" : size === "lg" || size === "xl" ? "large" : "middle"}
      type={variant === "primary" || variant === "danger" ? "primary" : "default"}
    >
      {content}
    </Button>
  );
}

export default CommandButton;
