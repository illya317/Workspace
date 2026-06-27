"use client";

import type { ReactNode } from "react";
import DisclosureSectionHeader from "./DisclosureSectionHeader";
import Pagination, { type PaginationProps } from "./Pagination";
import SelectionGrid, { type SelectionGridProps } from "./SelectionGrid";
import SelectorPanel, { type SelectorPanelProps } from "./SelectorPanel";
import TabBar, { type TabBarProps, type TabBarVariant, type TabDef } from "./TabBar";
import { joinClassNames } from "./card-utils";

export type NavigationSurfaceKind = "tabs" | "pagination" | "selector" | "disclosure" | "steps";
export type NavigationSurfaceLooseItem = ReturnType<typeof JSON.parse>;

export interface NavigationSurfaceStepSpec {
  key: string;
  label: ReactNode;
  href?: string;
  disabled?: boolean;
  tone?: "primary" | "neutral" | "muted";
  className?: string;
  steps?: NavigationSurfaceStepSpec[];
}

export interface NavigationSurfaceTabsProps {
  kind: "tabs";
  tabs: TabBarProps;
  className?: string;
}

export interface NavigationSurfacePaginationProps {
  kind: "pagination";
  pagination: PaginationProps;
  className?: string;
}

export interface NavigationSurfaceSelectorProps<T> {
  kind: "selector";
  selector: NavigationSurfaceSelectorSpec<T>;
  className?: string;
}

export interface NavigationSurfaceGridSelectorProps {
  kind: "selector";
  grid: SelectionGridProps;
  className?: string;
}

export type NavigationSurfaceSelectorSpec<T> = SelectorPanelProps<T>;

export interface NavigationSurfaceDisclosureProps {
  kind: "disclosure";
  title: string;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
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
  className?: string;
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
    <nav aria-label={props.ariaLabel} className={joinClassNames("flex flex-wrap gap-2 text-xs", props.className)}>
      {props.steps.map((step) => {
        const isActive = step.key === props.active;
        const className = joinClassNames(
          "inline-flex min-h-9 items-center rounded px-3 py-2 transition",
          stepClassName(step, isActive),
          step.className,
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
      <div className={props.className}>
        <TabBar {...props.tabs} />
      </div>
    );
  }

  if (props.kind === "pagination") {
    return (
      <div className={props.className}>
        <Pagination {...props.pagination} />
      </div>
    );
  }

  if (props.kind === "selector") {
    if ("grid" in props) {
      return (
        <div className={props.className}>
          <SelectionGrid {...props.grid} />
        </div>
      );
    }

    return (
      <div className={props.className}>
        <SelectorPanel<T> {...props.selector} />
      </div>
    );
  }

  if (props.kind === "disclosure") {
    return (
      <div className={props.className}>
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
  const hasLinkStep = props.steps.some((step) => step.href || step.disabled || step.tone || step.className);

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
        className={props.className}
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
      className={props.className}
    />
  );
}
