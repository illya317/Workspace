"use client";

import { useEffect, type ReactNode } from "react";
import { Button, Drawer, Segmented } from "antd";
import { ActionGlyph } from "../action/ActionGlyphs";
import type { ActionGlyphKind } from "../action/ActionGlyphs";
import { joinClassNames } from "../common/card-utils";
import type { ControlSize } from "../common/interactionTokens";
import type { ToolbarItemRendererComponent } from "./antd-toolbar";
import {
  resolveToolbarActionIcon,
  resolveToolbarActionVariant,
  type ToolbarRenderableAction,
} from "./toolbar-action-model";
import type { ToolbarItem, ToolbarMenuActionItem, ToolbarMenuItem } from "./Toolbar.types";
import { ToolbarFilterPanelFields } from "./ToolbarFilterPanel";

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
  useEffect(() => {
    if (!open) return;
    const desktopQuery = window.matchMedia("(min-width: 640px)");

    function closeOnDesktop(event: MediaQueryListEvent) {
      if (event.matches) onClose();
    }

    desktopQuery.addEventListener("change", closeOnDesktop);
    return () => {
      desktopQuery.removeEventListener("change", closeOnDesktop);
    };
  }, [onClose, open]);

  return (
    <Drawer
      className="sm:hidden"
      closeIcon={<ActionGlyph kind="x" className="size-5" />}
      data-mobile-toolbar-sheet="true"
      destroyOnHidden
      footer={null}
      mask={{ closable: true }}
      onClose={onClose}
      open={open}
      placement="bottom"
      size="auto"
      styles={{ body: { maxHeight: "76dvh", overflowY: "auto", paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" } }}
      title={title}
    >
      <div data-mobile-toolbar-sheet-scroll="true">{children}</div>
    </Drawer>
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
              executeMobileToolbarAction(action, onSubmit);
              onClose();
            }}
          />
        ))}
      </div>
    </MobileSheetSection>
  );
}

export function executeMobileToolbarAction(action: ToolbarRenderableAction, onSubmit?: () => void) {
  if (action.onClick) action.onClick();
  else if (action.type === "submit") onSubmit?.();
}

export function MobileToolbarControlList({
  title,
  items,
  size,
  onClose,
  renderItem: RenderItem,
  compact = false,
}: {
  title?: string;
  items: ToolbarItem[];
  size: ControlSize;
  onClose: () => void;
  renderItem: ToolbarItemRendererComponent;
  compact?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <MobileSheetSection title={title}>
      <div className={joinClassNames("grid min-w-0", compact ? "gap-2" : "gap-3")}>
        {items.map((item) => (
          <MobileToolbarControl key={item.key} item={item} size={size} onClose={onClose} renderItem={RenderItem} compact={compact} />
        ))}
      </div>
    </MobileSheetSection>
  );
}

function MobileToolbarControl({
  item,
  size,
  onClose,
  renderItem: RenderItem,
  compact,
}: {
  item: ToolbarItem;
  size: ControlSize;
  onClose: () => void;
  renderItem: ToolbarItemRendererComponent;
  compact: boolean;
}) {
  if (item.kind === "label") {
    return <div className="px-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{item.label}</div>;
  }
  if (item.kind === "text") {
    return <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">{item.content}</div>;
  }
  if (item.kind === "menu") return <MobileToolbarMenu item={item} onClose={onClose} />;
  if (item.kind === "page-size") return <MobilePageSizeControl item={item} />;
  if (item.kind === "filter-panel") {
    return (
      <div
        className={joinClassNames(
          "min-w-0 border border-slate-200 bg-slate-50/70",
          compact ? "rounded-xl p-2" : "rounded-2xl p-3",
        )}
        data-mobile-toolbar-control="filter-panel"
      >
        <ToolbarFilterPanelFields item={item} compact />
      </div>
    );
  }

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
        <RenderItem item={item} size={size} />
      </div>
    </div>
  );
}

function MobilePageSizeControl({ item }: { item: Extract<ToolbarItem, { kind: "page-size" }> }) {
  const label = item.label && item.label !== "每页条数" ? `${item.label} · 每页条数` : "每页条数";
  return (
    <fieldset className="min-w-0" data-mobile-toolbar-control="page-size">
      <legend className="mb-2 px-1 text-xs font-semibold text-slate-500">{label}</legend>
      <Segmented
        aria-label={label}
        block
        onChange={(value) => item.onChange(String(value))}
        options={item.options.map((option) => ({ value: option.value, label: option.label, disabled: option.disabled }))}
        size="large"
        value={item.value}
      />
    </fieldset>
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
    <Button
      block
      disabled={disabled}
      danger={variant === "danger"}
      icon={<ActionGlyph kind={icon} className="size-5" />}
      onClick={onSelect}
      data-mobile-toolbar-action-row="true"
      className="!flex !h-14 !justify-start !rounded-none !border-x-0 !border-b-0 first:!border-t-0"
      size="large"
      type={variant === "primary" ? "primary" : "text"}
    >
      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-5">{label}</span>
    </Button>
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
