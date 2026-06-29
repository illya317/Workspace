"use client";

import type { ReactNode } from "react";
import DisclosureSectionHeader from "./internal/common/DisclosureSectionHeader";
import Pagination, { type PaginationProps } from "./internal/common/Pagination";
import SelectionGrid, { type SelectionGridProps } from "./internal/selection/SelectionGrid";
import SelectorPanel, { type SelectorPanelProps } from "./internal/selection/SelectorPanel";
import TabBar, { type TabBarProps, type TabBarVariant, type TabDef } from "./internal/common/TabBar";
import { joinClassNames } from "./internal/common/card-utils";

export type NavigationSurfaceKind = "tabs" | "pagination" | "selector" | "disclosure" | "steps";
export type NavigationSurfaceLooseItem = ReturnType<typeof JSON.parse>;
type NavigationPublicSpec<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NavigationSurfaceTabsSpec = NavigationPublicSpec<TabBarProps, "className">;
export type NavigationSurfaceSelectorSpec<T> = NavigationPublicSpec<SelectorPanelProps<T>, "className" | "bodyClassName" | "contentClassName">;

export interface NavigationSurfacePaginationSpec {
  page: PaginationProps["page"];
  totalPages: PaginationProps["totalPages"];
  total?: PaginationProps["total"];
  onPageChange: PaginationProps["onPageChange"];
  compact?: PaginationProps["compact"];
}

export interface NavigationSurfaceGridSpec {
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
  label?: ReactNode;
  tabs: NavigationSurfaceTabsSpec;
}

export interface NavigationSurfacePaginationProps {
  kind: "pagination";
  pagination: NavigationSurfacePaginationSpec;
}

export interface NavigationSurfaceGridSelectorProps {
  kind: "selector";
  grid: NavigationSurfaceGridSpec;
}

export interface NavigationSurfaceSelectorProps<T> {
  kind: "selector";
  selector: NavigationSurfaceSelectorSpec<T>;
}

export interface NavigationSurfaceDisclosureProps {
  kind: "disclosure";
  title: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
}

export interface NavigationSurfaceStepsProps {
  kind: "steps";
  steps: NavigationSurfaceStepSpec[];
  active: string;
  activeChild?: string;
  onChange?: (key: string) => void;
  onChildChange?: (key: string) => void;
  variant?: Extract<TabBarVariant, "large" | "small">;
  ariaLabel?: string;
}

export type NavigationSurfaceProps<T = NavigationSurfaceLooseItem> =
  | NavigationSurfaceTabsProps
  | NavigationSurfacePaginationProps
  | NavigationSurfaceSelectorProps<T>
  | NavigationSurfaceGridSelectorProps
  | NavigationSurfaceDisclosureProps
  | NavigationSurfaceStepsProps;

function toTabDef(step: NavigationSurfaceStepSpec): TabDef {
  return {
    key: step.key,
    label: step.label,
    children: step.steps?.map(toTabDef),
  };
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

export default function NavigationSurface<T = NavigationSurfaceLooseItem>(props: NavigationSurfaceProps<T>) {
  if (props.kind === "tabs") {
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

  if (props.kind === "pagination") {
    return (
      <div>
        <Pagination {...props.pagination} />
      </div>
    );
  }

  if (props.kind === "selector") {
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

  if (props.kind === "disclosure") {
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
