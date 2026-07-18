"use client";

import { useEffect, useState } from "react";
import { ActionGlyph } from "../action/ActionGlyphs";
import { joinClassNames } from "../common/card-utils";
import type { ControlSize } from "../common/interactionTokens";
import type { ToolbarGroupedItems } from "./Toolbar.layout";
import {
  getOrderedActions,
  getToolbarItemActions,
  resolveToolbarActionIcon,
  resolveToolbarActionVariant,
  ToolbarItemRenderer,
  type ToolbarRenderableAction,
} from "./Toolbar.parts";
import type { ToolbarItem } from "./Toolbar.types";

type MobileToolbarSheet = "filters" | "more" | null;

export default function MobileToolbarContent({
  grouped,
  size,
}: {
  grouped: ToolbarGroupedItems;
  size: ControlSize;
}) {
  const [sheet, setSheet] = useState<MobileToolbarSheet>(null);
  const actions = getOrderedActions(grouped.actions.flatMap(getToolbarItemActions));
  const primaryAction = actions[0];
  const overflowActions = actions.slice(1);
  const hasFilters = grouped.filter.length > 0;
  const hasMore = overflowActions.length > 0 || grouped.trailing.length > 0;

  useEffect(() => {
    if (!sheet) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheet(null);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sheet]);

  return (
    <div className="space-y-2.5">
      {grouped.search.length > 0 ? (
        <div className="grid gap-2">
          {grouped.search.map((item) => <ToolbarItemRenderer key={item.key} item={item} size={size} />)}
        </div>
      ) : null}

      <div className="flex min-w-0 items-stretch gap-2 overflow-x-auto pb-0.5">
        {grouped.lead.map((item) => <MobileLeadItem key={item.key} item={item} size={size} />)}
        {primaryAction ? <MobileActionButton action={primaryAction} /> : null}
        {hasFilters ? (
          <MobileCommandButton
            icon="filter"
            label="筛选"
            active={sheet === "filters"}
            onClick={() => setSheet((current) => current === "filters" ? null : "filters")}
          />
        ) : null}
        {hasMore ? (
          <MobileCommandButton
            icon="more"
            label="更多"
            active={sheet === "more"}
            onClick={() => setSheet((current) => current === "more" ? null : "more")}
          />
        ) : null}
      </div>

      <MobileToolbarSheet
        title={sheet === "filters" ? "筛选条件" : "更多操作"}
        open={sheet !== null}
        onClose={() => setSheet(null)}
      >
        {sheet === "filters" ? (
          <div className="grid gap-3">
            {grouped.filter.map((item) => (
              <div key={item.key} className="min-w-0 [&>*]:w-full">
                <ToolbarItemRenderer item={item} size={size} />
              </div>
            ))}
          </div>
        ) : null}
        {sheet === "more" ? (
          <div className="grid gap-3">
            {overflowActions.length > 0 ? (
              <div className="grid gap-2">
                {overflowActions.map((action, index) => (
                  <MobileSheetActionButton
                    key={action.key ?? `${action.kind}-${index}`}
                    action={action}
                    onSelect={() => setSheet(null)}
                  />
                ))}
              </div>
            ) : null}
            {overflowActions.length > 0 && grouped.trailing.length > 0 ? <div className="h-px bg-slate-100" /> : null}
            {grouped.trailing.map((item) => (
              <div key={item.key} className="min-w-0 [&>*]:w-full">
                <ToolbarItemRenderer item={item} size={size} />
              </div>
            ))}
          </div>
        ) : null}
      </MobileToolbarSheet>
    </div>
  );
}

function MobileLeadItem({ item, size }: { item: ToolbarItem; size: ControlSize }) {
  if (item.kind !== "create") return <ToolbarItemRenderer item={item} size={size} />;
  return (
    <button
      type="button"
      disabled={item.disabled || item.active}
      onClick={item.onClick}
      className="inline-flex min-h-12 min-w-[4.5rem] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:bg-slate-300"
    >
      <ActionGlyph kind="add" className="size-4" />
      <span className="max-w-20 truncate">{item.label ?? "新建"}</span>
    </button>
  );
}

function MobileActionButton({ action }: { action: ToolbarRenderableAction }) {
  const variant = resolveToolbarActionVariant(action) ?? "secondary";
  return (
    <button
      type={action.type ?? "button"}
      disabled={action.disabled}
      onClick={action.onClick}
      className={joinClassNames(
        "inline-flex min-h-12 min-w-[4.5rem] shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold shadow-sm transition active:scale-[0.98] disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400",
        variant === "primary" && "border-emerald-600 bg-emerald-600 text-white",
        variant === "danger" && "border-red-200 bg-white text-red-600",
        variant === "secondary" && "border-slate-200 bg-white text-slate-700",
      )}
    >
      <ActionGlyph kind={resolveToolbarActionIcon(action)} className="size-4" />
      <span className="max-w-20 truncate">{action.label}</span>
    </button>
  );
}

function MobileCommandButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: "filter" | "more";
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={active}
      onClick={onClick}
      className={joinClassNames(
        "inline-flex min-h-12 min-w-[4.5rem] shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold shadow-sm transition active:scale-[0.98]",
        active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700",
      )}
    >
      <ActionGlyph kind={icon} className="size-4" />
      {label}
    </button>
  );
}

function MobileSheetActionButton({
  action,
  onSelect,
}: {
  action: ToolbarRenderableAction;
  onSelect: () => void;
}) {
  return (
    <button
      type={action.type ?? "button"}
      disabled={action.disabled}
      onClick={() => {
        action.onClick?.();
        onSelect();
      }}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left text-sm font-semibold text-slate-700 transition active:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
        <ActionGlyph kind={resolveToolbarActionIcon(action)} className="size-4" />
      </span>
      {action.label}
    </button>
  );
}

function MobileToolbarSheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] sm:hidden">
      <button type="button" aria-label="关闭面板" onClick={onClose} className="absolute inset-0 bg-slate-950/35" />
      <section className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-3xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-slate-100 text-lg text-slate-500">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}
