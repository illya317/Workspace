"use client";

import { useState, type FC } from "react";
import {
  AmountCell,
  CodeBlock,
  ColumnToggle,
  DataTable,
  DataTableActionsCell,
  StatusBadge,
} from "@workspace/core/ui";

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
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["name", "status", "amount"]);
  return (
    <DataTable
      rows={[
        { id: 1, name: "合同 A", status: "已生效", amount: 125000 },
        { id: 2, name: "合同 B", status: "待审核", amount: 48000 },
        { id: 3, name: "合同 C", status: "已归档", amount: 0 },
      ]}
      columns={[
        { key: "name", label: "名称", required: true, render: (row) => row.name },
        { key: "status", label: "状态", defaultVisible: true, render: (row) => <StatusBadge label={row.status} variant={row.status === "已生效" ? "green" : row.status === "待审核" ? "yellow" : "gray"} /> },
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
    return <div className="text-xs text-slate-400"><p className="font-medium">createDataTableEditActions</p><p>DataTable 行编辑动作工厂，统一详情、编辑、保存、取消和删除动作组合。</p><p className="mt-1 text-slate-300">Hook / 工具函数，无组件级实时预览。</p></div>;
}

function isDataTableEditDirtyPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">isDataTableEditDirty</p><p>DataTable 行编辑 dirty 判断工具，和 createDataTableEditActions 配套使用。</p><p className="mt-1 text-slate-300">Hook / 工具函数，无组件级实时预览。</p></div>;
}

function DisclosureRecordCardPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">DisclosureRecordCard</p><p>可展开记录卡片，统一历史、日志和明细记录的折叠头、详情区和行级动作。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function RegistryBrowserCardPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">RegistryBrowserCard</p><p>注册表浏览卡片，以 3/7 分栏展示分类和注册项明细。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function StructuredTablePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">StructuredTable</p><p>结构化表格 primitive，支持 colSpan、rowSpan、列宽和单元格内容插槽。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function TableScrollFramePreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">TableScrollFrame</p><p>表格横向滚动外壳，避免业务包重复手写 overflow-x-auto 表格容器。</p><p className="mt-1 text-slate-300">实时预览待补充。</p></div>;
}

function dataTableClassNamesPreview() {
    return <div className="text-xs text-slate-400"><p className="font-medium">dataTableClassNames</p><p>DataTable 样式 recipe，统一表头、行、单元格和空态 class 组合。</p><p className="mt-1 text-slate-300">Foundation / 样式 recipe，无运行时组件预览。</p></div>;
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
