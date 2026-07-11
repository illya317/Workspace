"use client";

import { PageSurface, createPageBody, createStatusSection } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, SurfaceToolbarItems, VisualizationGanttDependencySpec, VisualizationGanttRowSpec } from "@workspace/core/ui";
import { WORK_GANTT_ZOOM_OPTIONS, periodLabel, type WorkGanttSurfaceProps, type WorkGanttZoom } from "./model";

export type WorkGanttViewportSpec = {
  zoom: WorkGanttZoom;
  periodStart: Date;
  onZoomChange: (zoom: WorkGanttZoom) => void;
  onPrevious: () => void;
  onNext: () => void;
  zoomAriaLabel?: string;
};

export type WorkGanttContentSpec = {
  key: string;
  title: string;
  rows: VisualizationGanttRowSpec[];
  dependencies?: VisualizationGanttDependencySpec[];
  leftHeader: string;
  emptyText: string;
  onToggle?: (key: string) => void;
  error?: string | null;
  errorKey?: string;
  loading?: boolean;
  loadingKey?: string;
  loadingText?: string;
  empty?: boolean;
  emptyKey?: string;
  emptyStatusText?: string;
};

export function WorkGanttPage({
  surface,
  toolbarItemsBefore = [],
  toolbarItemsAfter = [],
  viewport,
  gantt,
}: {
  surface?: WorkGanttSurfaceProps;
  toolbarItemsBefore?: SurfaceToolbarItems;
  toolbarItemsAfter?: SurfaceToolbarItems;
  viewport: WorkGanttViewportSpec;
  gantt: WorkGanttContentSpec;
}) {
  const viewportToolbarItems = [
    {
      kind: "option-group",
      key: "zoom",
      value: viewport.zoom,
      options: WORK_GANTT_ZOOM_OPTIONS,
      onChange: (value) => viewport.onZoomChange(value as WorkGanttZoom),
      ariaLabel: viewport.zoomAriaLabel ?? "甘特时间缩放",
    },
    {
      kind: "period",
      key: "period-nav",
      mode: "nav",
      label: periodLabel(viewport.periodStart, viewport.zoom),
      onPrevious: viewport.onPrevious,
      onNext: viewport.onNext,
    },
  ] satisfies SurfaceToolbarItems;
  const section: BodySurfaceSectionSpec = gantt.error
    ? createStatusSection(gantt.errorKey ?? `${gantt.key}-error`, { kind: "error", content: gantt.error })
    : gantt.loading
      ? createStatusSection(gantt.loadingKey ?? `${gantt.key}-loading`, { kind: "loading", content: gantt.loadingText ?? "加载甘特..." })
      : gantt.empty
        ? createStatusSection(gantt.emptyKey ?? `${gantt.key}-empty`, { kind: "empty", content: gantt.emptyStatusText ?? gantt.emptyText })
        : {
          key: gantt.key,
          body: {
            kind: "visualization",
            visualization: {
              kind: "gantt",
              gantt: {
                frame: { title: gantt.title },
                timeline: {
                  kind: "gantt",
                  rows: gantt.rows,
                  dependencies: gantt.dependencies,
                  periodStart: viewport.periodStart,
                  zoom: viewport.zoom,
                  leftHeader: gantt.leftHeader,
                  emptyText: gantt.emptyText,
                  onToggle: gantt.onToggle,
                },
              },
            },
          },
        };

  return (
    <PageSurface
      kind="standard"
      {...surface}
      toolbar={{ items: [...(surface?.toolbar?.items ?? []), ...toolbarItemsBefore, ...viewportToolbarItems, ...toolbarItemsAfter] }}
      body={createPageBody([section])}
    />
  );
}
