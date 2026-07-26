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
  if (zoom === "quarter") return `${start.getFullYear()}年第${Math.floor(start.getMonth() / 3) + 1}季度`;
  return `${start.getFullYear()}年${start.getMonth() + 1}月`;
}

export function periodValue(start: Date, zoom: WorkGanttZoom) {
  if (zoom === "year") return String(start.getFullYear());
  if (zoom === "quarter") return `${start.getFullYear()}-Q${Math.floor(start.getMonth() / 3) + 1}`;
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
}

export function periodFromValue(value: string, zoom: WorkGanttZoom) {
  if (zoom === "year") {
    if (!/^\d{4}$/.test(value)) return null;
    return new Date(Number(value), 0, 1);
  }
  if (zoom === "quarter") {
    const match = /^(\d{4})-Q([1-4])$/.exec(value);
    if (!match) return null;
    return new Date(Number(match[1]), (Number(match[2]) - 1) * 3, 1);
  }
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Number(match[1]), month - 1, 1);
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
