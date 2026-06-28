import type { VisualizationGanttZoom } from "./VisualizationGanttTypes";

const DAY_MS = 24 * 60 * 60 * 1000;

export function periodStartFromDate(date: Date, zoom: VisualizationGanttZoom) {
  if (zoom === "year") return new Date(date.getFullYear(), 0, 1);
  if (zoom === "quarter") return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function buildGanttTicks(start: Date, zoom: VisualizationGanttZoom) {
  const ticks: Array<{ key: string; label: string; date: Date }> = [];
  if (zoom === "month") {
    const end = rangeEnd(start, zoom);
    const cursor = new Date(start);
    while (cursor <= end) {
      ticks.push({ key: dateKey(cursor), label: `${cursor.getMonth() + 1}/${cursor.getDate()}`, date: new Date(cursor) });
      cursor.setDate(cursor.getDate() + 7);
    }
    return ticks;
  }
  if (zoom === "quarter") {
    for (let index = 0; index <= 3; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
      ticks.push({ key: dateKey(date), label: `${date.getMonth() + 1}月`, date });
    }
    return ticks;
  }

  for (let index = 0; index <= periodMonths(zoom); index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    ticks.push({ key: dateKey(date), label: `${date.getMonth() + 1}月`, date });
  }
  return ticks;
}

export function rangeEnd(start: Date, zoom: VisualizationGanttZoom) {
  return new Date(start.getFullYear(), start.getMonth() + periodMonths(zoom), 1);
}

export function datePercent(date: Date, start: Date, end: Date) {
  return Math.max(0, Math.min(100, ((date.getTime() - start.getTime()) / Math.max(DAY_MS, end.getTime() - start.getTime())) * 100));
}

export function parseGanttDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeDate(value: Date | string) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  return parseGanttDate(value);
}

function periodMonths(zoom: VisualizationGanttZoom) {
  if (zoom === "year") return 12;
  if (zoom === "quarter") return 3;
  return 1;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
