"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type DropdownSurfaceAlign = "left" | "right";

export interface DropdownSurfaceRenderContext {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

export interface DropdownSurfaceProps {
  trigger: (ctx: DropdownSurfaceRenderContext) => ReactNode;
  children: ReactNode | ((ctx: DropdownSurfaceRenderContext) => ReactNode);
  align?: DropdownSurfaceAlign;
  className?: string;
  surfaceClassName?: string;
}

export interface DropdownItemClassNameOptions {
  /** @deprecated 选中态不改变菜单行视觉，仅保留给调用方语义兼容。 */
  active?: boolean;
  tone?: "default" | "danger";
  layout?: "block" | "flex";
}

/**
 * 下拉选项 / 菜单项的共享视觉配方。
 * 供 DropdownMenu 与 SelectField 在保持各自语义（menu/listbox）的前提下统一行样式。
 */
export function getDropdownItemClassName({
  tone = "default",
  layout = "block",
}: DropdownItemClassNameOptions = {}): string {
  const layoutClass =
    layout === "flex" ? "flex w-full items-center" : "block w-full";
  const colorClass =
    tone === "danger"
      ? "text-red-600 hover:bg-red-50"
      : "text-gray-700 hover:bg-gray-50";
  return `${layoutClass} px-4 py-2 text-left text-sm transition-colors ${colorClass}`;
}

/**
 * 下拉浮层行为 primitive：封装 open/toggle/close、外部点击关闭、Escape 关闭、
 * 相对触发位置的左右对齐和通用浮层样式。供 DropdownMenu / SelectField 等组件复用。
 */
export default function DropdownSurface({
  trigger,
  children,
  align = "left",
  className = "",
  surfaceClassName = "",
}: DropdownSurfaceProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const alignClassName = align === "right" ? "right-0" : "left-0";

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const toggle = useCallback(() => setOpen((current) => !current), []);
  const close = useCallback(() => setOpen(false), []);

  const ctx: DropdownSurfaceRenderContext = { open, toggle, close };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {trigger(ctx)}
      {open && (
        <div
          className={`absolute ${alignClassName} z-50 mt-1 rounded-md border border-gray-200 bg-white shadow-lg ${surfaceClassName}`}
        >
          {typeof children === "function" ? children(ctx) : children}
        </div>
      )}
    </div>
  );
}
