"use client";

import type { ReactNode } from "react";
import { ActionButton } from "../action/ActionControls";
import type { ActionGlyphKind } from "../action/ActionGlyphs";

function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export interface TabDef {
  key: string;
  label: ReactNode;
  children?: TabDef[];
}

export type TabBarVariant = "large" | "mid" | "small" | "micro";
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
    nav: "flex flex-wrap items-center w-full gap-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm",
    button: {
      base: "h-11 rounded-lg px-6 text-sm font-semibold transition",
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
  mid: {
    nav: "flex mb-6 gap-2 overflow-x-auto border-b border-gray-200 pb-1",
    button: {
      base: "whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition",
      active: "border-b-2 border-emerald-500 text-emerald-600",
      inactive: "text-gray-500 hover:text-gray-700",
    },
  },
  small: {
    nav: "flex flex-wrap items-center w-fit gap-2 rounded-lg border-0 bg-transparent p-0 shadow-none",
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
    nav: "flex w-fit rounded-md border border-slate-200 bg-slate-50 p-0.5",
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

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={joinClassNames(styles.nav, className)}
    >
      {renderActions(leadingActions)}

      <div className="flex items-center gap-2">
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
}
