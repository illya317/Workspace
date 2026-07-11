import type { PageSurfaceProps, VisualizationGanttZoom } from "@workspace/core/ui";

export type WorkGanttZoom = VisualizationGanttZoom;
export type WorkGanttSurfaceProps = Pick<PageSurfaceProps, "tabbar" | "toolbar">;

export const WORK_GANTT_ZOOM_OPTIONS = [
  { value: "year", label: "年" },
  { value: "quarter", label: "季度" },
  { value: "month", label: "月" },
];

export function periodLabel(start: Date, zoom: WorkGanttZoom) {
  if (zoom === "year") return `${start.getFullYear()}年`;
  if (zoom === "quarter") return `${start.getFullYear()}年 Q${Math.floor(start.getMonth() / 3) + 1}`;
  return `${start.getFullYear()}年 ${start.getMonth() + 1}月`;
}

export function periodStart(date: Date, zoom: WorkGanttZoom) {
  if (zoom === "year") return new Date(date.getFullYear(), 0, 1);
  if (zoom === "quarter") return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function shiftPeriod(start: Date, zoom: WorkGanttZoom, delta: number) {
  return new Date(start.getFullYear(), start.getMonth() + periodMonths(zoom) * delta, 1);
}

function periodMonths(zoom: WorkGanttZoom) {
  if (zoom === "year") return 12;
  if (zoom === "quarter") return 3;
  return 1;
}
