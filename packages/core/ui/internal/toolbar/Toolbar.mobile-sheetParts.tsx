"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ActionGlyph } from "../action/ActionGlyphs";
import type { ActionGlyphKind } from "../action/ActionGlyphs";
import { joinClassNames } from "../common/card-utils";
import type { ControlSize } from "../common/interactionTokens";
import {
  resolveToolbarActionIcon,
  resolveToolbarActionVariant,
  ToolbarItemRenderer,
  type ToolbarRenderableAction,
} from "./Toolbar.parts";
import type { ToolbarItem, ToolbarMenuActionItem, ToolbarMenuItem } from "./Toolbar.types";

export function MobileToolbarSheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const sheetRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const desktopQuery = window.matchMedia("(min-width: 640px)");

    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = getFocusableElements(sheetRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    desktopQuery.addEventListener("change", closeOnDesktop);
    const animationFrame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      desktopQuery.removeEventListener("change", closeOnDesktop);
      window.requestAnimationFrame(() => previouslyFocused?.focus({ preventScroll: true }));
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] h-[100dvh] sm:hidden" data-mobile-toolbar-sheet="true">
      <button
        type="button"
        aria-label="关闭面板"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
      />
      <section
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 flex max-h-[86dvh] min-h-0 flex-col overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl"
      >
        <div className="shrink-0 px-4 pb-2 pt-2">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />
          <div className="flex min-h-11 items-center justify-between gap-3">
            <h2 id={titleId} className="min-w-0 text-lg font-bold text-slate-900">{title}</h2>
            <button
              ref={closeRef}
              type="button"
              aria-label={`关闭${title}`}
              onClick={onClose}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 transition active:bg-slate-200"
            >
              <ActionGlyph kind="x" className="size-5" />
            </button>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain border-t border-slate-100 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2"
          data-mobile-toolbar-sheet-scroll="true"
        >
          {children}
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function MobileToolbarActionList({
  leadItems,
  actions,
  onClose,
  onSubmit,
}: {
  leadItems: ToolbarItem[];
  actions: ToolbarRenderableAction[];
  onClose: () => void;
  onSubmit?: () => void;
}) {
  if (leadItems.length === 0 && actions.length === 0) return null;
  return (
    <MobileSheetSection title="操作">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {leadItems.map((item) => (
          <MobileLeadActionRow key={item.key} item={item} onClose={onClose} />
        ))}
        {actions.map((action, index) => (
          <MobileActionRow
            key={action.key ?? `${action.kind}-${index}`}
            icon={resolveToolbarActionIcon(action)}
            label={action.label}
            disabled={action.disabled}
            variant={resolveToolbarActionVariant(action)}
            onSelect={() => {
              action.onClick?.();
              if (action.type === "submit") onSubmit?.();
              onClose();
            }}
          />
        ))}
      </div>
    </MobileSheetSection>
  );
}

export function MobileToolbarControlList({
  title,
  items,
  size,
  onClose,
  compact = false,
}: {
  title?: string;
  items: ToolbarItem[];
  size: ControlSize;
  onClose: () => void;
  compact?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <MobileSheetSection title={title}>
      <div className={joinClassNames("grid min-w-0", compact ? "gap-2" : "gap-3")}>
        {items.map((item) => (
          <MobileToolbarControl key={item.key} item={item} size={size} onClose={onClose} compact={compact} />
        ))}
      </div>
    </MobileSheetSection>
  );
}

function MobileToolbarControl({
  item,
  size,
  onClose,
  compact,
}: {
  item: ToolbarItem;
  size: ControlSize;
  onClose: () => void;
  compact: boolean;
}) {
  if (item.kind === "label") {
    return <div className="px-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{item.label}</div>;
  }
  if (item.kind === "text") {
    return <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">{item.content}</div>;
  }
  if (item.kind === "menu") return <MobileToolbarMenu item={item} onClose={onClose} />;

  const label = getControlLabel(item);
  return (
    <div
      className={joinClassNames(
        "min-w-0 border border-slate-200 bg-slate-50/70",
        compact ? "rounded-xl p-2" : "rounded-2xl p-3",
      )}
      data-mobile-toolbar-control={item.kind}
    >
      {label ? <div className="mb-2 text-xs font-semibold text-slate-500">{label}</div> : null}
      <div className="min-w-0 [&>*]:w-full">
        <ToolbarItemRenderer item={item} size={size} />
      </div>
    </div>
  );
}

function MobileToolbarMenu({ item, onClose }: { item: ToolbarMenuItem; onClose: () => void }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 px-1 text-xs font-semibold text-slate-500">{item.trigger.label}</div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {item.items.map((menuItem) => (
          <MobileMenuAction key={menuItem.key} item={menuItem} onClose={onClose} />
        ))}
      </div>
    </div>
  );
}

function MobileMenuAction({ item, onClose }: { item: ToolbarMenuActionItem; onClose: () => void }) {
  const className = joinClassNames(
    "block min-h-14 w-full border-t border-slate-100 px-4 py-4 text-left text-[15px] font-semibold first:border-t-0 disabled:cursor-not-allowed disabled:opacity-45",
    item.tone === "danger" ? "text-red-600 active:bg-red-50" : "text-slate-800 active:bg-slate-50",
    item.separatorBefore && "mt-2 border-t-8 border-slate-100",
  );
  if (item.href && !item.disabled && !item.onSelect) {
    return <a href={item.href} className={className} onClick={onClose}>{item.label}</a>;
  }
  return (
    <button
      type="button"
      disabled={item.disabled}
      onClick={() => {
        if (item.disabled) return;
        onClose();
        void item.onSelect?.();
      }}
      className={className}
    >
      {item.label}
    </button>
  );
}

function MobileLeadActionRow({ item, onClose }: { item: ToolbarItem; onClose: () => void }) {
  if (item.kind === "create") {
    return (
      <MobileActionRow
        icon="add"
        label={item.label ?? "新增"}
        disabled={item.disabled || item.active}
        variant={item.active ? "secondary" : "primary"}
        onSelect={() => {
          item.onClick();
          onClose();
        }}
      />
    );
  }
  if (item.kind === "panel-toggle") {
    return (
      <MobileActionRow
        icon={item.icon}
        label={item.label}
        disabled={item.disabled}
        variant={item.variant}
        onSelect={() => {
          item.onClick?.();
          onClose();
        }}
      />
    );
  }
  return null;
}

function MobileActionRow({
  icon,
  label,
  disabled,
  variant = "secondary",
  onSelect,
}: {
  icon: ActionGlyphKind;
  label: string;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      data-mobile-toolbar-action-row="true"
      className={joinClassNames(
        "flex min-h-14 w-full items-center gap-3 border-t border-slate-100 px-3 py-2.5 text-left first:border-t-0 disabled:cursor-not-allowed disabled:opacity-45",
        variant === "danger" ? "text-red-700 active:bg-red-50" : "text-slate-800 active:bg-slate-50",
      )}
    >
      <span className={joinClassNames(
        "grid size-10 shrink-0 place-items-center rounded-xl",
        variant === "danger"
          ? "bg-red-50 text-red-600"
          : variant === "primary"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-slate-100 text-slate-600",
      )}>
        <ActionGlyph kind={icon} className="size-5" />
      </span>
      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-5">{label}</span>
    </button>
  );
}

function MobileSheetSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      {title ? <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{title}</h3> : null}
      {children}
    </section>
  );
}

function getControlLabel(item: ToolbarItem) {
  if (item.kind === "column-toggle") return "显示列";
  if (item.kind === "page-size") return item.label ?? "每页条数";
  return undefined;
}

function getFocusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}
