"use client";

import { Button, Card, Col, Collapse, Empty, Row, Statistic } from "antd";
import type {
  DataSurfaceProps,
  DataSurfaceCommandSpec,
  DataSurfaceRecordProps,
  DataSurfaceSummaryProps,
} from "../../DataSurface.types";
import { renderAntdDataValue } from "./antd-data-value";
import { renderAntdCommands } from "../common/antd-command";
import { AntdDataTable } from "./antd-data-table";
import { AntdStructuredTable } from "./antd-data-structured";
import { AntdDataCellProvider } from "./antd-data-cell";

/** Data actions share the governed Ant command renderer. */
function AntdDataActions({ actions }: { actions?: DataSurfaceCommandSpec[] }) {
  return renderAntdCommands(actions);
}

function AntdDataSummary({ data }: { data: DataSurfaceSummaryProps }) {
  if (data.metrics.length === 0) return <Empty description={data.empty ?? "暂无指标"} />;
  return (
    <Row gutter={[12, 12]}>
      {data.metrics.map((metric) => (
        <Col key={metric.key} xs={12} md={8} xl={6}>
          <Card className="h-full border-teal-100 bg-gradient-to-br from-white to-teal-50/60 [&_.ant-statistic-content]:font-bold [&_.ant-statistic-content]:tracking-tight [&_.ant-statistic-title]:text-xs" size="small">
            <Statistic title={metric.label} value={typeof metric.value === "number" || typeof metric.value === "string" ? metric.value : undefined} formatter={() => renderAntdDataValue(metric.value)} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}

function AntdDataRecords({ data }: { data: DataSurfaceRecordProps }) {
  if (data.records.length === 0) return <Empty description={data.empty ?? "暂无数据"} />;
  const activeKeys = data.records.filter((record) => record.expanded).map((record) => record.key);
  return (
    <Collapse
      activeKey={activeKeys}
      items={data.records.map((record) => ({
        key: record.key,
        label: (
          <div className="flex min-w-0 items-center justify-between gap-3">
            <span className="min-w-0 font-semibold">{renderAntdDataValue(record.header)}</span>
            {record.summary ? <span className="shrink-0 text-sm text-slate-500">{renderAntdDataValue(record.summary)}</span> : null}
          </div>
        ),
        children: (
          <div className="grid gap-3">
            {record.detailTitle ? <h4 className="font-semibold text-slate-800">{record.detailTitle}</h4> : null}
            <div>{renderAntdDataValue(record.detail)}</div>
            {record.detailAction ? (
              <div>
                <Button loading={record.detailAction.loading} onClick={record.detailAction.onClick}>
                  {record.detailAction.loading ? record.detailAction.loadingLabel ?? record.detailAction.label : record.detailAction.label}
                </Button>
              </div>
            ) : null}
          </div>
        ),
      }))}
      onChange={(keys) => {
        const nextKeys = new Set(Array.isArray(keys) ? keys.map(String) : [String(keys)]);
        for (const record of data.records) {
          if (nextKeys.has(record.key) !== record.expanded) record.onToggle();
        }
      }}
    />
  );
}

export function AntdDataSurface<T>({ data }: { data: DataSurfaceProps<T> }) {
  const content = data.kind === "table" ? <AntdDataTable data={data} />
    : data.kind === "structured" ? <AntdStructuredTable data={data} />
      : data.kind === "summary" ? <AntdDataSummary data={data} />
        : <AntdDataRecords data={data} />;
  const governedContent = (
    <AntdDataCellProvider renderNestedData={(nested) => <AntdDataSurface data={nested} />}>
      {content}
    </AntdDataCellProvider>
  );
  if (data.wrap === false) return governedContent;
  return (
    <div className="space-y-4">
      <AntdDataActions actions={data.actions} />
      {governedContent}
    </div>
  );
}
