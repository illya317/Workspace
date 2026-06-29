import type { ReactNode } from "react";
import type { VisualizationGanttSpec } from "./internal/visualization/VisualizationGanttTypes";

export type VisualizationSurfaceKind = "chart" | "gantt";
export type VisualizationTone = "blue" | "emerald" | "amber" | "rose" | "slate";

export interface VisualizationLegendSpec {
  key: string;
  label: string;
  tone?: VisualizationTone;
  marker?: "solid" | "reference";
}

export interface VisualizationBarSpec {
  key: string;
  label: string;
  value: number;
  valueLabel?: string | number;
  tone?: VisualizationTone;
  title?: string;
  minPercent?: number;
}

export interface VisualizationBarChartSpec {
  kind: "barChart";
  title?: string;
  bars: VisualizationBarSpec[];
  min?: number;
  max?: number;
  height?: number;
  emptyText?: string;
  legend?: VisualizationLegendSpec[];
}

export interface VisualizationGroupedBarGroupSpec {
  key: string;
  label: string;
  bars: VisualizationBarSpec[];
}

export interface VisualizationGroupedBarChartSpec {
  kind: "groupedBarChart";
  title?: string;
  groups: VisualizationGroupedBarGroupSpec[];
  max?: number;
  height?: number;
  emptyText?: string;
  legend?: VisualizationLegendSpec[];
}

export interface VisualizationComparisonBarItemSpec {
  key: string;
  label: string;
  actual: number;
  reference?: number;
  valueLabel?: string;
  diffLabel?: string;
  tone?: VisualizationTone;
  diffTone?: VisualizationTone;
}

export interface VisualizationComparisonBarSectionSpec {
  key: string;
  title: string;
  subtitle?: string;
  tone?: VisualizationTone;
  items: VisualizationComparisonBarItemSpec[];
}

export interface VisualizationComparisonBarsSpec {
  kind: "comparisonBars";
  sections: VisualizationComparisonBarSectionSpec[];
  max?: number;
  emptyText?: string;
  legend?: VisualizationLegendSpec[];
}

export interface VisualizationTreeBadgeSpec {
  key: string;
  label: string;
  tone?: VisualizationTone;
}

export interface VisualizationTreeNodeSpec {
  key: string;
  label: string;
  subtitle?: string;
  level?: number;
  badges?: VisualizationTreeBadgeSpec[];
  children?: VisualizationTreeNodeSpec[];
}

export interface VisualizationTreeSpec {
  kind: "tree";
  nodes: VisualizationTreeNodeSpec[];
  emptyText?: string;
  maxHeight?: number;
}

export type VisualizationSpec =
  | VisualizationBarChartSpec
  | VisualizationGroupedBarChartSpec
  | VisualizationComparisonBarsSpec
  | VisualizationTreeSpec;

export interface VisualizationSurfaceBaseProps {
  kind: VisualizationSurfaceKind;
  title?: ReactNode;
  subtitle?: ReactNode;
  framed?: boolean;
  className?: string;
  bodyClassName?: string;
}

export interface VisualizationSurfaceChartProps extends VisualizationSurfaceBaseProps {
  kind: "chart";
  visual: VisualizationSpec;
}

export interface VisualizationSurfaceGanttProps extends VisualizationSurfaceBaseProps {
  kind: "gantt";
  gantt: VisualizationGanttSpec;
  empty?: ReactNode;
}

export type VisualizationSurfaceProps =
  | VisualizationSurfaceChartProps
  | VisualizationSurfaceGanttProps;
