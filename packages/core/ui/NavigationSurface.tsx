"use client";

import type { ReactNode } from "react";
import Pagination, { type PaginationProps } from "./internal/common/Pagination";
import TabBar, { type TabBarProps, type TabBarVariant, type TabDef } from "./internal/common/TabBar";
import { joinClassNames } from "./internal/common/card-utils";

export type NavigationSurfaceKind = "tabs" | "steps" | "pagination";
export type NavigationSurfaceLooseItem = ReturnType<typeof JSON.parse>;
type NavigationTabsVariant = Extract<TabBarVariant, "large" | "small">;

export interface NavigationSurfaceItemSpec {
  key: string;
  label: ReactNode;
  description?: ReactNode;
  href?: string;
  onClick?: () => void;
  children?: NavigationSurfaceItemSpec[];
}

export interface NavigationSurfaceStepSpec {
  key: string;
  label: ReactNode;
  href?: string;
  disabled?: boolean;
  tone?: "primary" | "neutral" | "muted";
  steps?: NavigationSurfaceStepSpec[];
}

export interface NavigationSurfaceTabsProps {
  kind: "tabs";
  items: NavigationSurfaceItemSpec[];
  active: string;
  activeChild?: string;
  onChange: (key: string) => void;
  onChildChange?: (key: string) => void;
  label?: ReactNode;
  variant?: NavigationTabsVariant;
  ariaLabel?: string;
}

export interface NavigationSurfaceStepsProps {
  kind: "steps";
  steps: NavigationSurfaceStepSpec[];
  active: string;
  activeChild?: string;
  onChange?: (key: string) => void;
  onChildChange?: (key: string) => void;
  variant?: NavigationTabsVariant;
  ariaLabel?: string;
}

export interface NavigationSurfacePaginationSpec {
  page: PaginationProps["page"];
  totalPages: PaginationProps["totalPages"];
  total?: PaginationProps["total"];
  onPageChange: PaginationProps["onPageChange"];
  compact?: PaginationProps["compact"];
}

export interface NavigationSurfacePaginationProps {
  kind: "pagination";
  pagination: NavigationSurfacePaginationSpec;
}

export type NavigationSurfaceProps =
  | NavigationSurfaceTabsProps
  | NavigationSurfaceStepsProps
  | NavigationSurfacePaginationProps;

function toTabDef(item: NavigationSurfaceItemSpec | NavigationSurfaceStepSpec): TabDef {
  const children = "children" in item ? item.children : "steps" in item ? item.steps : undefined;
  return {
    key: item.key,
    label: item.label,
    children: children?.map(toTabDef),
  };
}

function renderTabs(props: NavigationSurfaceTabsProps) {
  const tabs = props.items.map(toTabDef);
  const hasChildren = props.items.some((item) => item.children?.length);
  const tabProps: TabBarProps = hasChildren
    ? {
        tabs,
        active: props.active,
        activeChild: props.activeChild,
        onChange: props.onChange,
        onChildChange: props.onChildChange,
        accordion: true,
        variant: props.variant ?? "large",
        ariaLabel: props.ariaLabel,
      }
    : {
        tabs,
        active: props.active,
        onChange: props.onChange,
        variant: props.variant ?? "large",
        ariaLabel: props.ariaLabel,
      };
  return (
    <div className={props.label ? "flex flex-wrap items-center gap-3" : undefined}>
      {props.label ? <span className="shrink-0 text-sm font-semibold text-slate-500">{props.label}</span> : null}
      <TabBar {...tabProps} />
    </div>
  );
}

function stepClassName(step: NavigationSurfaceStepSpec, active: boolean) {
  if (step.disabled) return "cursor-not-allowed bg-slate-50 text-slate-400";
  if (active) return "bg-slate-200 font-semibold text-slate-900";
  if (step.tone === "primary") return "bg-blue-100 font-medium text-blue-800 hover:bg-blue-200";
  if (step.tone === "muted") return "bg-slate-50 text-slate-500 hover:bg-slate-100";
  return "bg-slate-100 text-slate-700 hover:bg-slate-200";
}

function renderStepLinks(props: NavigationSurfaceStepsProps) {
  return (
    <nav aria-label={props.ariaLabel} className="flex flex-wrap gap-2 text-xs">
      {props.steps.map((step) => {
        const isActive = step.key === props.active;
        const className = joinClassNames("inline-flex min-h-9 items-center rounded px-3 py-2 transition", stepClassName(step, isActive));
        if (step.href && !step.disabled) {
          return <a key={step.key} href={step.href} aria-current={isActive ? "page" : undefined} className={className}>{step.label}</a>;
        }
        return (
          <button key={step.key} type="button" disabled={step.disabled} aria-current={isActive ? "step" : undefined} className={className} onClick={() => props.onChange?.(step.key)}>
            {step.label}
          </button>
        );
      })}
    </nav>
  );
}

function renderSteps(props: NavigationSurfaceStepsProps) {
  const tabs = props.steps.map(toTabDef);
  const hasChildren = props.steps.some((step) => step.steps?.length);
  const hasLinkStep = props.steps.some((step) => step.href || step.disabled || step.tone);
  if (hasChildren) {
    return (
      <TabBar
        tabs={tabs}
        active={props.active}
        activeChild={props.activeChild}
        onChange={props.onChange ?? (() => {})}
        onChildChange={props.onChildChange}
        accordion
        variant={props.variant ?? "small"}
        ariaLabel={props.ariaLabel}
      />
    );
  }
  if (hasLinkStep) return renderStepLinks(props);
  return <TabBar tabs={tabs} active={props.active} onChange={props.onChange ?? (() => {})} variant={props.variant ?? "small"} ariaLabel={props.ariaLabel} />;
}

export default function NavigationSurface(props: NavigationSurfaceProps) {
  if (props.kind === "tabs") return renderTabs(props);
  if (props.kind === "steps") return renderSteps(props);
  return <Pagination {...props.pagination} />;
}
