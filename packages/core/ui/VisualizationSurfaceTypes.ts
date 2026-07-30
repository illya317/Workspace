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
  legendPlacement?: "footer" | "header-center" | "header-end";
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

export type VisualizationNetworkNodeEmphasis = "focus" | "primary" | "context";

export interface VisualizationNetworkLayoutSpec {
  kind: "converging" | "hierarchy";
  nodeAspect?: "horizontal" | "adaptive";
}

export interface VisualizationNetworkNodeSpec {
  key: string;
  label: string;
  subtitle?: string;
  groupKey?: string;
  tone?: VisualizationTone;
  emphasis?: VisualizationNetworkNodeEmphasis;
  size?: "compact" | "default" | "wide";
  badges?: VisualizationTreeBadgeSpec[];
  layoutOrder?: number;
}

export interface VisualizationNetworkEdgeSpec {
  key: string;
  source: string;
  target: string;
  label?: string;
  value?: number;
  tone?: VisualizationTone;
  dashed?: boolean;
}

export interface VisualizationNetworkGroupSpec {
  key: string;
  label: string;
  subtitle?: string;
  tone?: VisualizationTone;
  outlined?: boolean;
  layoutOrder?: number;
}

export interface VisualizationNetworkBackNavigationSpec {
  label: string;
  onActivate: () => void;
}

export interface VisualizationNetworkEdgeDirectionLegendSpec {
  outgoingLabel: string;
  incomingLabel: string;
  selfReferenceLabel?: string;
}

export interface VisualizationNetworkSpec {
  kind: "network";
  presentation?: "diagram" | "map";
  layout?: VisualizationNetworkLayoutSpec;
  groups?: VisualizationNetworkGroupSpec[];
  nodes: VisualizationNetworkNodeSpec[];
  edges: VisualizationNetworkEdgeSpec[];
  focusNodeKey?: string;
  onNodeSelect?: (nodeKey: string) => void;
  backNavigation?: VisualizationNetworkBackNavigationSpec;
  edgeDirectionLegend?: VisualizationNetworkEdgeDirectionLegendSpec;
  emptyText?: string;
  height?: number;
}

export type VisualizationSpec =
  | VisualizationBarChartSpec
  | VisualizationGroupedBarChartSpec
  | VisualizationComparisonBarsSpec
  | VisualizationTreeSpec
  | VisualizationNetworkSpec;

export interface VisualizationSurfaceFrameSpec {
  title?: ReactNode;
  subtitle?: ReactNode;
}

export interface VisualizationSurfaceChartSpec {
  visual: VisualizationSpec;
  frame?: VisualizationSurfaceFrameSpec;
}

export interface VisualizationSurfaceGanttSpec {
  timeline: VisualizationGanttSpec;
  empty?: ReactNode;
  frame?: VisualizationSurfaceFrameSpec;
}

export interface VisualizationSurfaceChartProps {
  kind: "chart";
  chart: VisualizationSurfaceChartSpec;
}

export interface VisualizationSurfaceGanttProps {
  kind: "gantt";
  gantt: VisualizationSurfaceGanttSpec;
}

export type VisualizationSurfaceProps =
  | VisualizationSurfaceChartProps
  | VisualizationSurfaceGanttProps;
