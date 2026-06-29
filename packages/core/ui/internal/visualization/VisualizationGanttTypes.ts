import type { ReactNode } from "react";

export type VisualizationGanttZoom = "year" | "quarter" | "month";
export type VisualizationGanttRowKind = "project" | "phase" | "task";
export type VisualizationGanttBarTone = "onTrack" | "delayed" | "emerald" | "slate";

export interface VisualizationGanttSegmentSpec {
  key: string;
  label: string;
  startDate?: string | null;
  endDate?: string | null;
  tone?: VisualizationGanttBarTone;
}

export interface VisualizationGanttMilestoneSpec {
  key: string;
  label: string;
  date?: string | null;
}

export interface VisualizationGanttDependencySpec {
  key: string;
  fromKey: string;
  toKey: string;
}

export interface VisualizationGanttRowSpec {
  key: string;
  label: string;
  kind?: VisualizationGanttRowKind;
  depth?: number;
  hasChildren?: boolean;
  expanded?: boolean;
  ownerNames?: string[];
  startDate?: string | null;
  endDate?: string | null;
  baselineStartDate?: string | null;
  baselineEndDate?: string | null;
  aggregateStartDate?: string | null;
  aggregateEndDate?: string | null;
  segments?: VisualizationGanttSegmentSpec[];
  milestones?: VisualizationGanttMilestoneSpec[];
  isMilestone?: boolean;
}

export interface VisualizationGanttSpec {
  kind: "gantt";
  rows: VisualizationGanttRowSpec[];
  periodStart: Date | string;
  zoom: VisualizationGanttZoom;
  leftHeader?: ReactNode;
  emptyText?: ReactNode;
  dependencies?: VisualizationGanttDependencySpec[];
  onToggle?: (key: string) => void;
}
