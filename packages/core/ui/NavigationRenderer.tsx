"use client";

import type { ReactNode } from "react";
import DisclosureSectionHeader from "./internal/common/DisclosureSectionHeader";
import Pagination, { type PaginationProps } from "./internal/common/Pagination";
import SelectionGrid, { type SelectionGridProps } from "./internal/selection/SelectionGrid";
import SelectorPanel, { type SelectorPanelProps } from "./internal/selection/SelectorPanel";
import TabBar, { type TabBarProps, type TabBarVariant, type TabDef } from "./internal/common/TabBar";
import { joinClassNames } from "./internal/common/card-utils";

export type NavigationRendererKind = "tabs" | "pagination" | "selector" | "disclosure" | "steps";
export type NavigationRendererLooseItem = ReturnType<typeof JSON.parse>;
type NavigationPublicSpec<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NavigationRendererTabsSpec = NavigationPublicSpec<TabBarProps, "className">;
export type NavigationRendererSelectorSpec<T> = NavigationPublicSpec<SelectorPanelProps<T>, "className" | "bodyClassName" | "contentClassName">;

export interface NavigationRendererPaginationSpec {
  page: PaginationProps["page"];
  totalPages: PaginationProps["totalPages"];
  total?: PaginationProps["total"];
  onPageChange: PaginationProps["onPageChange"];
  compact?: PaginationProps["compact"];
}

export interface NavigationRendererGridSpec {
  options: SelectionGridProps["options"];
  value?: SelectionGridProps["value"];
  onChange?: SelectionGridProps["onChange"];
  mode?: SelectionGridProps["mode"];
  onItemClick?: SelectionGridProps["onItemClick"];
  columns?: SelectionGridProps["columns"];
  layout?: SelectionGridProps["layout"];
  minItemWidth?: SelectionGridProps["minItemWidth"];
  truncate?: SelectionGridProps["truncate"];
  disabled?: SelectionGridProps["disabled"];
  emptyText?: SelectionGridProps["emptyText"];
  ariaLabel: SelectionGridProps["ariaLabel"];
}

export interface NavigationRendererStepSpec {
  key: string;
  label: ReactNode;
  href?: string;
  disabled?: boolean;
  tone?: "primary" | "neutral" | "muted";
  steps?: NavigationRendererStepSpec[];
}

export interface NavigationRendererTabsProps {
  kind: "tabs";
  label?: ReactNode;
  tabs: NavigationRendererTabsSpec;
}

export interface NavigationRendererPaginationProps {
  kind: "pagination";
  pagination: NavigationRendererPaginationSpec;
}

export interface NavigationRendererGridSelectorProps {
  kind: "selector";
  grid: NavigationRendererGridSpec;
}

export interface NavigationRendererSelectorProps<T> {
  kind: "selector";
  selector: NavigationRendererSelectorSpec<T>;
}

export interface NavigationRendererDisclosureProps {
  kind: "disclosure";
  title: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
}

export interface NavigationRendererStepsProps {
  kind: "steps";
  steps: NavigationRendererStepSpec[];
  active: string;
  activeChild?: string;
  onChange?: (key: string) => void;
  onChildChange?: (key: string) => void;
  variant?: Extract<TabBarVariant, "large" | "small">;
  ariaLabel?: string;
}

export type NavigationRendererProps<T = NavigationRendererLooseItem> =
  | NavigationRendererTabsProps
  | NavigationRendererPaginationProps
  | NavigationRendererSelectorProps<T>
  | NavigationRendererGridSelectorProps
  | NavigationRendererDisclosureProps
  | NavigationRendererStepsProps;

function toTabDef(step: NavigationRendererStepSpec): TabDef {
  return {
    key: step.key,
    label: step.label,
    children: step.steps?.map(toTabDef),
  };
}

function stepClassName(step: NavigationRendererStepSpec, active: boolean) {
  if (step.disabled) return "cursor-not-allowed bg-slate-50 text-slate-400";
  if (active) return "bg-slate-200 font-semibold text-slate-900";
  if (step.tone === "primary") return "bg-blue-100 font-medium text-blue-800 hover:bg-blue-200";
  if (step.tone === "muted") return "bg-slate-50 text-slate-500 hover:bg-slate-100";
  return "bg-slate-100 text-slate-700 hover:bg-slate-200";
}

function renderStepLinks(props: NavigationRendererStepsProps) {
  return (
    <nav aria-label={props.ariaLabel} className="flex flex-wrap gap-2 text-xs">
      {props.steps.map((step) => {
        const isActive = step.key === props.active;
        const className = joinClassNames(
          "inline-flex min-h-9 items-center rounded px-3 py-2 transition",
          stepClassName(step, isActive),
        );
        if (step.href && !step.disabled) {
          return (
            <a key={step.key} href={step.href} aria-current={isActive ? "page" : undefined} className={className}>
              {step.label}
            </a>
          );
        }
        return (
          <button
            key={step.key}
            type="button"
            disabled={step.disabled}
            aria-current={isActive ? "step" : undefined}
            className={className}
            onClick={() => props.onChange?.(step.key)}
          >
            {step.label}
          </button>
        );
      })}
    </nav>
  );
}

function renderTabsNavigation(props: NavigationRendererTabsProps) {
  return (
    <div className={props.label ? "flex flex-wrap items-center gap-3" : undefined}>
      {props.label ? (
        <span className="shrink-0 text-sm font-semibold text-slate-500">
          {props.label}
        </span>
      ) : null}
      <TabBar {...props.tabs} />
    </div>
  );
}

function renderPaginationNavigation(props: NavigationRendererPaginationProps) {
  return (
    <div>
      <Pagination {...props.pagination} />
    </div>
  );
}

function renderSelectorNavigation<T>(props: NavigationRendererSelectorProps<T> | NavigationRendererGridSelectorProps) {
  if ("grid" in props) {
    return (
      <div>
        <SelectionGrid {...props.grid} />
      </div>
    );
  }

  return (
    <div>
      <SelectorPanel<T> {...props.selector} />
    </div>
  );
}

function renderDisclosureNavigation(props: NavigationRendererDisclosureProps) {
  return (
    <div>
      <DisclosureSectionHeader
        title={props.title}
        count={props.count}
        expanded={props.expanded}
        onToggle={props.onToggle}
      />
    </div>
  );
}

function renderStepsNavigation(props: NavigationRendererStepsProps) {
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

  return (
    <TabBar
      tabs={tabs}
      active={props.active}
      onChange={props.onChange ?? (() => {})}
      variant={props.variant ?? "small"}
      ariaLabel={props.ariaLabel}
    />
  );
}

export default function NavigationRenderer<T = NavigationRendererLooseItem>(props: NavigationRendererProps<T>) {
  if (props.kind === "tabs") return renderTabsNavigation(props);
  if (props.kind === "pagination") return renderPaginationNavigation(props);
  if (props.kind === "selector") return renderSelectorNavigation<T>(props);
  if (props.kind === "disclosure") return renderDisclosureNavigation(props);
  return renderStepsNavigation(props);
}
