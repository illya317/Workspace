import type { ReactNode } from "react";
import { MetricCard } from "./BaseCards";
import { joinClassNames } from "./card-utils";

export interface MetricTileProps {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}

/**
 * 详情页指标卡。
 *
 * 基于 MetricCard 保持统一视觉，默认紧凑内边距，适合放在 EntityDetailLayout.Metrics 中。
 */
export default function MetricTile({ label, value, className }: MetricTileProps) {
  return <MetricCard label={label} value={value} className={joinClassNames("px-3 py-2", className)} />;
}
