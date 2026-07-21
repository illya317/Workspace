"use client";

import { useState } from "react";
import type { WorkGanttZoom } from "./model";
import { periodFromValue, periodStart, shiftPeriod } from "./model";

export function useWorkGanttViewport(initialZoom: WorkGanttZoom = "year") {
  const [zoom, setZoom] = useState<WorkGanttZoom>(initialZoom);
  const [periodStartDate, setPeriodStartDate] = useState(() => periodStart(new Date(), initialZoom));

  function changeZoom(nextZoom: WorkGanttZoom) {
    setZoom(nextZoom);
    setPeriodStartDate((current) => periodStart(current, nextZoom));
  }

  return {
    zoom,
    periodStart: periodStartDate,
    changeZoom,
    changePeriod: (value: string) => {
      const next = periodFromValue(value, zoom);
      if (next) setPeriodStartDate(next);
    },
    previousPeriod: () => setPeriodStartDate((current) => shiftPeriod(current, zoom, -1)),
    nextPeriod: () => setPeriodStartDate((current) => shiftPeriod(current, zoom, 1)),
  };
}
