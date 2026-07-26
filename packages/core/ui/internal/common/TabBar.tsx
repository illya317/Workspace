"use client";

import { useState, type ReactNode } from "react";
import { ActionButton } from "../action/ActionControls";
import type { ActionGlyphKind } from "../action/ActionGlyphs";
import DetailModal from "./DetailModal";
import { textOverflowTitle } from "./text-overflow";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export interface TabDef {
  key: string;
  label: ReactNode;
  compactLabel?: ReactNode;
  children?: TabDef[];
}

export type TabBarVariant = "large" | "lineLarge" | "mid" | "small" | "micro";
export type TabBarKind = "page" | "table";

export interface TabBarAction {
  key: string;
  icon: ActionGlyphKind;
  label: string;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  onClick: () => void;
}

interface VariantStyle {
  nav: string;
  button: {
    base: string;
    active: string;
    inactive: string;
  };
  childPanel?: {
    base: string;
    button: {
      base: string;
      active: string;
      inactive: string;
    };
  };
}

export const TAB_VARIANT_STYLES: Record<TabBarVariant, VariantStyle> = {
  large: {
    nav: "flex w-full items-center gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:flex-wrap sm:gap-3",
    button: {
      base: "h-10 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition sm:h-11 sm:px-6",
      active: "bg-emerald-600 text-white shadow-sm",
      inactive: "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
    },
    childPanel: {
      base: "flex items-center rounded-lg h-11 gap-1.5 border border-emerald-100 bg-emerald-50/60 px-1.5",
      button: {
        base: "h-8 rounded-md px-4 text-sm font-semibold transition",
        active: "bg-white text-emerald-700 shadow-sm",
        inactive: "text-slate-500 hover:bg-white/80 hover:text-slate-900",
      },
    },
  },
  lineLarge: {
    nav: "flex w-full items-center gap-2 overflow-x-auto border-b border-slate-200 bg-transparent p-0 pb-2 shadow-none sm:flex-wrap sm:gap-3",
    button: {
      base: "h-11 rounded-lg px-6 text-sm font-semibold transition",
      active: "bg-emerald-600 text-white shadow-sm",
      inactive: "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
    },
  },
  mid: {
    nav: "flex mb-6 gap-2 overflow-x-auto border-b border-gray-200 pb-1",
    button: {
      base: "whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition",
      active: "border-b-2 border-emerald-500 text-emerald-600",
      inactive: "text-gray-500 hover:text-gray-700",
    },
  },
  small: {
    nav: "flex max-w-full items-center gap-2 overflow-x-auto rounded-lg border-0 bg-transparent p-0 shadow-none sm:w-fit sm:flex-wrap",
    button: {
      base: "h-10 rounded-lg px-4 text-sm font-semibold transition",
      active: "bg-emerald-600 text-white shadow-sm",
      inactive: "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
    },
    childPanel: {
      base: "flex items-center rounded-lg h-10 gap-1 border border-slate-200 bg-slate-50 px-1",
      button: {
        base: "h-8 rounded-md px-3 text-sm font-semibold transition",
        active: "bg-white text-emerald-700 shadow-sm",
        inactive: "text-slate-500 hover:bg-white/80 hover:text-slate-900",
      },
    },
  },
  micro: {
    nav: "flex max-w-full overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-0.5 sm:w-fit",
    button: {
      base: "min-w-10 rounded px-3 py-1.5 text-xs font-semibold transition",
      active: "bg-white text-emerald-700 shadow-sm",
      inactive: "text-slate-500 hover:text-slate-900",
    },
  },
};

function variantForKind(kind?: TabBarKind): TabBarVariant | undefined {
  if (kind === "page") return "large";
  if (kind === "table") return "small";
  return undefined;
}

export interface TabBarBaseProps {
  tabs: TabDef[];
  kind?: TabBarKind;
  className?: string;
  variant?: TabBarVariant;
  accordion?: boolean;
  ariaLabel?: string;
  leadingActions?: TabBarAction[];
  trailingActions?: TabBarAction[];
}

export interface TabBarNonAccordionProps extends TabBarBaseProps {
  accordion?: false;
  active: string;
  onChange: (key: string) => void;
}

export interface TabBarAccordionProps extends TabBarBaseProps {
  accordion: true;
  active: string;
  onChange: (key: string) => void;
  activeChild?: string;
  onChildChange?: (key: string) => void;
}

export type TabBarProps = TabBarNonAccordionProps | TabBarAccordionProps;

export default function TabBar(props: TabBarProps) {
  const {
    tabs,
    active,
    onChange,
    kind,
    className = "",
    variant: providedVariant,
    accordion = false,
    ariaLabel,
    leadingActions,
    trailingActions,
  } = props;

  const variant = providedVariant ?? variantForKind(kind) ?? "mid";
  if (accordion && variant !== "large" && variant !== "small") {
    throw new Error(`TabBar accordion is only supported for variant='large' or variant='small', received variant='${variant}'.`);
  }

  const styles = TAB_VARIANT_STYLES[variant];
  const activeChild = accordion ? (props as TabBarAccordionProps).activeChild : undefined;
  const onChildChange = accordion ? (props as TabBarAccordionProps).onChildChange : undefined;
  const activeTab = tabs.find((tab) => tab.key === active);
  const activeChildTab = activeTab?.children?.find((tab) => tab.key === activeChild);
  const activeMobileLabel = activeChildTab
    ? <>{activeTab?.label}<span aria-hidden="true" className="text-slate-300">·</span>{activeChildTab.label}</>
    : activeTab?.label ?? "选择栏目";
  const compactMobileNavigation = tabs.length > 3 || tabs.some((tab) => (tab.children?.length ?? 0) > 0);

  const renderActions = (actions: TabBarAction[] | undefined) => {
    if (!actions || actions.length === 0) return null;
    return (
      <div className="flex shrink-0 items-center gap-2">
        {actions.map((action) => (
          <ActionButton
            key={action.key}
            kind={action.icon}
            label={action.label}
            variant={action.variant}
            disabled={action.disabled}
            onClick={action.onClick}
          />
        ))}
      </div>
    );
  };

  const desktopTabs = (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={joinClassNames(styles.nav, "hidden sm:flex", className)}
    >
      {renderActions(leadingActions)}
      <div className="flex min-w-max items-center gap-2">
        {tabs.map((tab) => {
          const selected = active === tab.key;
          const children = tab.children ?? [];
          const childPanelStyle = styles.childPanel;
          return (
            <div key={tab.key} className="flex items-center">
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onChange(tab.key)}
                className={joinClassNames(
                  styles.button.base,
                  selected ? styles.button.active : styles.button.inactive,
                )}
              >
                {tab.label}
              </button>
              {accordion && selected && children.length > 0 && childPanelStyle && (
                <div className={joinClassNames("ml-2", childPanelStyle.base)}>
                  {children.map((child) => {
                    const childSelected = activeChild === child.key;
                    return (
                      <button
                        key={child.key}
                        type="button"
                        role="tab"
                        aria-selected={childSelected}
                        onClick={() => onChildChange?.(child.key)}
                        className={joinClassNames(
                          childPanelStyle.button.base,
                          childSelected ? childPanelStyle.button.active : childPanelStyle.button.inactive,
                        )}
                      >
                        {child.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {renderActions(trailingActions)}
    </div>
  );

  return (
    <>
      <div className={joinClassNames("sm:hidden", className)}>
        {compactMobileNavigation ? (
          <MobileTabSelector
            tabs={tabs}
            active={active}
            activeChild={activeChild}
            activeLabel={activeMobileLabel}
            ariaLabel={ariaLabel}
            onChange={onChange}
            onChildChange={onChildChange}
          />
        ) : (
          <div role="tablist" aria-label={ariaLabel} className="flex rounded-xl border border-slate-200 bg-slate-100 p-1 shadow-sm">
            {tabs.map((tab) => {
              const selected = active === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  title={textOverflowTitle(compactTabLabel(tab))}
                  onClick={() => onChange(tab.key)}
                  className={joinClassNames(
                    "min-h-11 min-w-0 flex-1 truncate rounded-lg px-3 text-sm font-semibold transition",
                    selected ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 active:bg-white/70",
                  )}
                >
                  {compactTabLabel(tab)}
                </button>
              );
            })}
          </div>
        )}
        {(leadingActions?.length || trailingActions?.length) ? (
          <div className="mt-2 flex items-center justify-end gap-2 overflow-x-auto">
            {renderActions(leadingActions)}
            {renderActions(trailingActions)}
          </div>
        ) : null}
      </div>
      {desktopTabs}
    </>
  );
}

function MobileTabSelector({
  tabs,
  active,
  activeChild,
  activeLabel,
  ariaLabel,
  onChange,
  onChildChange,
}: {
  tabs: TabDef[];
  active: string;
  activeChild?: string;
  activeLabel: ReactNode;
  ariaLabel?: string;
  onChange: (key: string) => void;
  onChildChange?: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition active:bg-slate-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">当前栏目</span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-bold leading-5 text-slate-900">{activeLabel}</span>
        </span>
        <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">切换</span>
      </button>
      <DetailModal open={open} title={ariaLabel ?? "切换栏目"} onClose={() => setOpen(false)} maxWidth="max-w-md">
        <div className="grid gap-3" role="tablist" aria-label={ariaLabel}>
          {tabs.map((tab) => {
            const selected = active === tab.key;
            return (
              <section key={tab.key} className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected && !activeChild}
                  onClick={() => {
                    onChange(tab.key);
                    setOpen(false);
                  }}
                  className={joinClassNames(
                    "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm font-semibold transition",
                    selected ? "bg-emerald-50 text-emerald-800" : "text-slate-700 active:bg-slate-50",
                  )}
                >
                  <span className="min-w-0 flex-1 break-words leading-5">{tab.label}</span>
                  {selected && !activeChild ? <span className="text-emerald-600">✓</span> : null}
                </button>
                {tab.children?.length ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                    {tab.children.map((child) => {
                      const childSelected = selected && activeChild === child.key;
                      return (
                        <button
                          key={child.key}
                          type="button"
                          role="tab"
                          aria-selected={childSelected}
                          onClick={() => {
                            onChange(tab.key);
                            onChildChange?.(child.key);
                            setOpen(false);
                          }}
                          className={joinClassNames(
                            "flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm transition",
                            childSelected ? "bg-slate-900 font-semibold text-white" : "text-slate-600 active:bg-slate-50",
                            childSelected ? "border-slate-900" : "border-slate-200 bg-white",
                          )}
                        >
                          <span className="min-w-0 flex-1 break-words leading-5">{child.label}</span>
                          {childSelected ? <span>✓</span> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </DetailModal>
    </>
  );
}

function compactTabLabel(tab?: TabDef) {
  return tab?.compactLabel ?? tab?.label;
}
