"use client";

import type { ReactNode } from "react";
import { EmptyStateCard, MetricCard } from "./internal/common/Card";
import { renderCommands, renderDisplay } from "./internal/data/DataSurface.renderers";
import type { DataSurfaceCommandSpec, DataSurfaceDisplaySpec } from "./DataSurface.types";

export interface MetricsSurfaceMetricSpec {
  key: string;
  label: ReactNode;
  value: ReactNode | DataSurfaceDisplaySpec;
}

export interface MetricsSurfaceProps {
  actions?: DataSurfaceCommandSpec[];
  empty?: ReactNode;
  wrap?: boolean;
  metrics: MetricsSurfaceMetricSpec[];
}

function renderMetrics(props: MetricsSurfaceProps) {
  if (props.metrics.length === 0) return <EmptyStateCard compact>{props.empty ?? "暂无指标"}</EmptyStateCard>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {props.metrics.map((metric) => (
        <MetricCard key={metric.key} label={metric.label} value={renderDisplay(metric.value)} />
      ))}
    </div>
  );
}

export default function MetricsSurface(props: MetricsSurfaceProps) {
  if (props.wrap === false) return renderMetrics(props);

  const content = (
    <div className="space-y-4">
      {renderCommands(props.actions)}
      {renderMetrics(props)}
    </div>
  );

  return content;
}
