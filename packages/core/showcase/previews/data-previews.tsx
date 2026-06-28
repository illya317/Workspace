"use client";

import { useState, type FC } from "react";
import {
  AmountCell,
  CodeBlock,
  DataSurface,
  DataTable,
  DisclosureRecordCard,
  Badge,
  PageSurface,
  StructuredTable,
  TableScrollFrame,
} from "@workspace/core/ui";

function CodeBlockPreview() {
  return (
    <CodeBlock>
      {`curl -X POST https://api.example.com/v1/items \n  -H "Content-Type: application/json" \n  -d '{"name": "示例"}'`}
    </CodeBlock>
  );
}

function DataTablePreview() {
  return (
    <div className="space-y-4">
      <DataTable
        rows={[
          { id: 1, name: "合同 A", status: "已生效", amount: 125000 },
          { id: 2, name: "合同 B", status: "待审核", amount: 48000 },
          { id: 3, name: "合同 C", status: "已归档", amount: 0 },
        ]}
        columns={[
          { key: "name", label: "名称", required: true, render: (row) => row.name },
          { key: "status", label: "状态", defaultVisible: true, render: (row) => <Badge label={row.status} tone={row.status === "已生效" ? "green" : row.status === "待审核" ? "yellow" : "gray"} /> },
          { key: "amount", label: "金额", defaultVisible: true, render: (row) => <AmountCell value={row.amount} /> },
        ]}
        rowActions={() => [
          { key: "view", kind: "view", label: "查看", onClick: () => {} },
          { key: "edit", kind: "edit", label: "编辑", onClick: () => {} },
        ]}
        rowKey={(row) => row.id}
        tableClassName="w-full"
      />
      <DataTable
        presentation={{ density: "compact", grid: "rows", header: "plain", rowHover: "neutral" }}
        rows={[
          { id: 1, item: "字段 A", value: "已配置" },
          { id: 2, item: "字段 B", value: "待维护" },
        ]}
        columns={[
          { key: "item", label: "项目", required: true, render: (row) => row.item },
          { key: "value", label: "值", required: true, render: (row) => row.value },
        ]}
        rowKey={(row) => row.id}
        tableClassName="w-full"
      />
    </div>
  );
}

function DataSurfacePreview() {
  return (
    <div className="space-y-4">
      <PageSurface
        kind="list"
        embedded
        toolbar={{
          items: [
            { kind: "search", key: "search", value: "", onChange: () => {}, placeholder: "搜索..." },
            { kind: "text", key: "count", content: "共 2 条" },
          ],
        }}
        body={{
          blocks: [{
            kind: "data",
            key: "contracts",
            surface: {
              kind: "table",
              rows: [
                { id: 1, name: "合同 A", status: "已生效", amount: 125000 },
                { id: 2, name: "合同 B", status: "待审核", amount: 48000 },
              ],
              columns: [
                { key: "name", label: "名称", required: true, render: (row) => row.name },
                { key: "status", label: "状态", defaultVisible: true, render: (row) => <Badge label={row.status} tone={row.status === "已生效" ? "green" : "yellow"} /> },
                { key: "amount", label: "金额", defaultVisible: true, render: (row) => <AmountCell value={row.amount} /> },
              ],
              rowKey: (row) => row.id,
              tableClassName: "w-full",
            },
          }],
        }}
      />
      <DataSurface
        kind="visual"
        title="人员趋势"
        framed
        visual={{
          kind: "groupedBarChart",
          title: "近 4 月入职/离职",
          height: 120,
          groups: [
            { key: "03", label: "03", bars: [{ key: "joins", label: "入职", value: 8, tone: "blue" }, { key: "leaves", label: "离职", value: 2, tone: "rose" }] },
            { key: "04", label: "04", bars: [{ key: "joins", label: "入职", value: 5, tone: "blue" }, { key: "leaves", label: "离职", value: 3, tone: "rose" }] },
            { key: "05", label: "05", bars: [{ key: "joins", label: "入职", value: 11, tone: "blue" }, { key: "leaves", label: "离职", value: 4, tone: "rose" }] },
            { key: "06", label: "06", bars: [{ key: "joins", label: "入职", value: 7, tone: "blue" }, { key: "leaves", label: "离职", value: 1, tone: "rose" }] },
          ],
          legend: [
            { key: "joins", label: "入职", tone: "blue" },
            { key: "leaves", label: "离职", tone: "rose" },
          ],
        }}
      />
    </div>
  );
}

function DisclosureRecordCardPreview() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="max-w-md">
      <DisclosureRecordCard
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        header={<span className="text-sm font-semibold text-slate-900">2026-06-20 合同变更记录</span>}
        summary={<Badge label="已生效" tone="green" />}
        detailTitle="变更详情"
        detailAction={{ label: "还原", onClick: () => {} }}
      >
        <div className="space-y-2 text-sm text-slate-600">
          <p>负责人由 张三 变更为 李四</p>
          <p>金额由 ¥100,000 调整为 ¥125,000</p>
        </div>
      </DisclosureRecordCard>
    </div>
  );
}

function StructuredTablePreview() {
  return (
    <div className="space-y-4">
      <TableScrollFrame className="rounded-lg border border-slate-200">
        <StructuredTable
          presentation={{ density: "compact", grid: "cells", header: "tinted", stripe: "subtle" }}
          className="w-full"
          colWidths={[120, 120, 160, 120]}
          rows={[
            [
              { content: "项目", header: true, rowSpan: 2 },
              { content: "阶段", header: true, rowSpan: 2 },
              { content: "2026 H1", header: true, colSpan: 2 },
            ],
            [
              { content: "预算", header: true },
              { content: "实际", header: true },
            ],
            [
              { content: "生产中心", rowSpan: 2 },
              { content: "Q1" },
              { content: "¥120,000" },
              { content: "¥98,000" },
            ],
            [
              { content: "Q2" },
              { content: "¥150,000" },
              { content: "¥142,000" },
            ],
          ]}
        />
      </TableScrollFrame>
      <TableScrollFrame className="rounded-lg border border-slate-200">
        <StructuredTable
          presentation={{ density: "compact", grid: "none", header: "plain" }}
          className="w-full"
          rows={[
            [{ content: "项目", header: true }, { content: "状态", header: true }],
            [{ content: "资料归档" }, { content: "完成" }],
            [{ content: "合同检查" }, { content: "进行中" }],
          ]}
        />
      </TableScrollFrame>
    </div>
  );
}

function TableScrollFramePreview() {
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">宽表格横向滚动外壳</p>
      <TableScrollFrame className="rounded-lg border border-slate-200">
        <table className="w-[40rem] text-sm">
          <thead className="bg-slate-50">
            <tr>
              {["A", "B", "C", "D", "E", "F"].map((h) => (
                <th key={h} className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">列 {h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((row) => (
              <tr key={row}>
                {["A", "B", "C", "D", "E", "F"].map((h) => (
                  <td key={h} className="border-b border-slate-100 px-3 py-2 text-slate-600">R{row}-{h}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScrollFrame>
    </div>
  );
}

function dataTableClassNamesPreview() {
  return (
    <div className="text-xs text-slate-400">
      <p className="font-medium">dataTableClassNames</p>
      <p>DataTable 样式 recipe，统一表头、行、单元格和空态 class 组合。</p>
      <p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p>
    </div>
  );
}

export const dataPreviewByName: Record<string, FC> = {
  CodeBlock: CodeBlockPreview,
  DataSurface: DataSurfacePreview,
  DataTable: DataTablePreview,
  DisclosureRecordCard: DisclosureRecordCardPreview,
  StructuredTable: StructuredTablePreview,
  TableScrollFrame: TableScrollFramePreview,
  dataTableClassNames: dataTableClassNamesPreview,
};
