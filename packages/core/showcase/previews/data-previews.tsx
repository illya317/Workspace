"use client";

import { useState, type FC } from "react";
import {
  AmountCell,
  CodeBlock,
  ColumnToggle,
  DataTable,
  DataTableActionsCell,
  DisclosureRecordCard,
  RegistryBrowserCard,
  Badge,
  StructuredTable,
  TableScrollFrame,
} from "@workspace/core/ui";
import type { RegistryBrowserItem } from "@workspace/core/ui";

function ColumnTogglePreview() {
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["name", "status", "amount"]);
  return (
    <div className="inline-flex items-center gap-2">
      <ColumnToggle
        columns={[
          { key: "name", label: "名称", required: true },
          { key: "status", label: "状态", defaultVisible: true },
          { key: "amount", label: "金额", defaultVisible: true },
          { key: "owner", label: "负责人" },
          { key: "updated", label: "更新时间" },
        ]}
        visible={visibleColumns}
        onChange={setVisibleColumns}
      />
    </div>
  );
}

function CodeBlockPreview() {
  return (
    <CodeBlock>
      {`curl -X POST https://api.example.com/v1/items \n  -H "Content-Type: application/json" \n  -d '{"name": "示例"}'`}
    </CodeBlock>
  );
}

function DataTablePreview() {
  const visibleColumns = ["name", "status", "amount"];
  return (
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
        { key: "actions", label: "操作", required: true, render: () => <DataTableActionsCell actions={[{ key: "view", kind: "view", label: "查看", onClick: () => {} }, { key: "edit", kind: "edit", label: "编辑", onClick: () => {} }]} /> },
      ]}
      visibleColumns={visibleColumns}
      rowKey={(row) => row.id}
      tableClassName="w-full"
    />
  );
}

function DataTableActionsCellPreview() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-400">操作列单元格，自动把多个动作排成一行</p>
      <div className="flex flex-wrap items-center gap-4">
        <DataTableActionsCell
          actions={[
            { key: "view", kind: "view", label: "查看", onClick: () => {} },
            { key: "edit", kind: "edit", label: "编辑", onClick: () => {} },
            { key: "delete", kind: "delete", label: "删除", onClick: () => {} },
          ]}
        />
        <DataTableActionsCell
          actions={[
            { key: "save", kind: "save", label: "保存", onClick: () => {} },
            { key: "cancel", kind: "cancel", label: "取消", onClick: () => {} },
          ]}
        />
        <DataTableActionsCell
          actions={[
            { key: "add", kind: "add", label: "新增", onClick: () => {} },
          ]}
        />
      </div>
    </div>
  );
}

function createDataTableEditActionsPreview() {
  return (
    <div className="text-xs text-slate-400">
      <p className="font-medium">createDataTableEditActions</p>
      <p>DataTable 行编辑动作工厂，统一详情、编辑、保存、取消和删除动作组合。</p>
      <p className="mt-1 text-slate-300">Hook / 工具函数，无组件级实时预览。</p>
    </div>
  );
}

function isDataTableEditDirtyPreview() {
  return (
    <div className="text-xs text-slate-400">
      <p className="font-medium">isDataTableEditDirty</p>
      <p>DataTable 行编辑 dirty 判断工具，和 createDataTableEditActions 配套使用。</p>
      <p className="mt-1 text-slate-300">Hook / 工具函数，无组件级实时预览。</p>
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

function RegistryBrowserCardPreview() {
  const items: RegistryBrowserItem[] = [
    {
      name: "ActionButton",
      tier: "primitive",
      tierLabel: "原子组件",
      tierDescription: "最小可交互组件",
      kind: "toolbar",
      kindLabel: "工具栏",
      kindDescription: "页面动作集合",
      description: "通用动作按钮 primitive",
      example: "详情页保存、取消、删除",
      includedComponents: [],
      foundationComponents: ["getToolbarActionClassName"],
      usedBy: ["ActionToolbar", "IconActionButton"],
      usageFiles: ["packages/core/ui/ActionControls.tsx"],
    },
    {
      name: "DataTable",
      tier: "assembly",
      tierLabel: "常用组合",
      tierDescription: "由 primitives 组合而成",
      kind: "data",
      kindLabel: "数据视图",
      kindDescription: "表格和数据阅读",
      description: "通用数据表格 primitive",
      example: "渲染科目、合同列表",
      includedComponents: ["DataTableActionsCell"],
      foundationComponents: ["dataTableClassNames"],
      usedBy: [],
      usageFiles: ["packages/core/ui/DataTable.tsx"],
    },
  ];
  return (
    <div className="max-w-2xl">
      <RegistryBrowserCard
        title="Core UI 注册浏览器"
        subtitle="按分层和分类浏览已注册组件"
        items={items}
      />
    </div>
  );
}

function StructuredTablePreview() {
  return (
    <TableScrollFrame className="rounded-lg border border-slate-200">
      <StructuredTable
        className="w-full text-sm"
        cellClassName="border border-slate-200 px-3 py-2 text-slate-700"
        headerCellClassName="border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-800"
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
  ColumnToggle: ColumnTogglePreview,
  CodeBlock: CodeBlockPreview,
  DataTable: DataTablePreview,
  DataTableActionsCell: DataTableActionsCellPreview,
  createDataTableEditActions: createDataTableEditActionsPreview,
  isDataTableEditDirty: isDataTableEditDirtyPreview,
  DisclosureRecordCard: DisclosureRecordCardPreview,
  RegistryBrowserCard: RegistryBrowserCardPreview,
  StructuredTable: StructuredTablePreview,
  TableScrollFrame: TableScrollFramePreview,
  dataTableClassNames: dataTableClassNamesPreview,
};
