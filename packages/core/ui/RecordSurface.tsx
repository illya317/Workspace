"use client";

import type { MouseEventHandler, ReactNode } from "react";
import { EmptyStateCard } from "./internal/common/Card";
import DisclosureRecordCard from "./internal/common/DisclosureRecordCard";
import { renderCommands, renderDisplay } from "./internal/data/DataSurface.renderers";
import type { DataSurfaceCommandSpec, DataSurfaceDisplaySpec } from "./DataSurface.types";

export interface RecordSurfaceActionSpec {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

export interface RecordSurfaceRecordSpec {
  key: string;
  expanded: boolean;
  onToggle: () => void;
  header: ReactNode | DataSurfaceDisplaySpec;
  summary?: ReactNode | DataSurfaceDisplaySpec;
  detail?: ReactNode | DataSurfaceDisplaySpec;
  detailTitle?: ReactNode;
  detailAction?: RecordSurfaceActionSpec;
}

export interface RecordSurfaceProps {
  actions?: DataSurfaceCommandSpec[];
  empty?: ReactNode;
  wrap?: boolean;
  records: RecordSurfaceRecordSpec[];
}

function renderRecords(props: RecordSurfaceProps) {
  if (props.records.length === 0) return <EmptyStateCard compact>{props.empty ?? "暂无数据"}</EmptyStateCard>;
  return (
    <div className="space-y-3">
      {props.records.map((record) => (
        <DisclosureRecordCard
          key={record.key}
          expanded={record.expanded}
          onToggle={record.onToggle}
          header={renderDisplay(record.header)}
          summary={renderDisplay(record.summary)}
          detailTitle={record.detailTitle}
          detailAction={record.detailAction}
        >
          {renderDisplay(record.detail)}
        </DisclosureRecordCard>
      ))}
    </div>
  );
}

export default function RecordSurface(props: RecordSurfaceProps) {
  if (props.wrap === false) return renderRecords(props);

  const content = (
    <div className="space-y-4">
      {renderCommands(props.actions)}
      {renderRecords(props)}
    </div>
  );

  return content;
}
