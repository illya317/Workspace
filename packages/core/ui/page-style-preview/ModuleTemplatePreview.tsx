"use client";

import { useMemo, useState } from "react";
import { ActionButton } from "../ActionControls";
import AccordionTabBar from "../AccordionTabBar";
import { AnalysisBlock, MetricCard, PanelCard } from "../BaseCards";
import DataTable, { type DataTableColumn } from "../DataTable";
import FormField from "../FormField";
import Pagination from "../Pagination";
import StatusBadge from "../StatusBadge";
import TextField from "../TextField";
import PreviewToolbar from "./PreviewToolbar";
import type { ModuleTemplate, PageTemplate } from "./template-data";

type Row = { id: string; name: string; owner: string; status: string; updated: string };

const rows: Row[] = [
  { id: "1", name: "月度主数据", owner: "张明", status: "现用", updated: "2026-06-18" },
  { id: "2", name: "季度核对", owner: "李青", status: "待确认", updated: "2026-06-12" },
  { id: "3", name: "归档样本", owner: "王岚", status: "归档", updated: "2026-05-30" },
];

const columns: DataTableColumn<Row>[] = [
  { key: "name", label: "名称", required: true, render: (row) => <strong>{row.name}</strong> },
  { key: "owner", label: "负责人", defaultVisible: true, render: (row) => row.owner },
  {
    key: "status",
    label: "状态",
    defaultVisible: true,
    render: (row) => <StatusBadge label={row.status} variant={row.status === "归档" ? "gray" : "green"} />,
  },
  { key: "updated", label: "更新时间", defaultVisible: true, render: (row) => row.updated },
];

export default function ModuleTemplatePreview({
  module,
  activeChild,
}: {
  module: ModuleTemplate;
  activeChild: string;
}) {
  const page = useMemo(
    () => module.pages.find((item) => item.key === activeChild) ?? module.pages[0],
    [activeChild, module.pages],
  );
  const [innerTab, setInnerTab] = useState(module.nav[0] ?? "总览");
  const [listVisible, setListVisible] = useState(true);
  const [pageNumber, setPageNumber] = useState(1);

  return (
    <div className="space-y-3">
      <PanelCard bodyClassName="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-slate-950">{module.label}</h2>
            <p className="mt-1 text-sm text-slate-500">{page.title}</p>
          </div>
        </div>
      </PanelCard>

      <AccordionTabBar
        tabs={[{ key: "main", label: module.label, children: module.nav.map((label) => ({ key: label, label })) }]}
        activeTab="main"
        activeChild={innerTab}
        onTabChange={() => {}}
        onChildChange={setInnerTab}
      />

      <PreviewToolbar
        listVisible={listVisible}
        onToggleList={page.kind === "split" || page.kind === "document" ? () => setListVisible((value) => !value) : undefined}
        onCreate={() => {}}
        totalLabel={page.kind === "table" ? "共 86 条" : "共 12 条"}
      />

      <TemplateBody module={module} page={page} listVisible={listVisible} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <span className="text-xs font-semibold text-slate-500">第 {pageNumber} / 8 页，共 86 条</span>
        <Pagination page={pageNumber} totalPages={8} total={86} onPageChange={setPageNumber} compact />
      </div>
    </div>
  );
}

function TemplateBody({
  module,
  page,
  listVisible,
}: {
  module: ModuleTemplate;
  page: PageTemplate;
  listVisible: boolean;
}) {
  if (page.kind === "split") return <SplitBody module={module} page={page} listVisible={listVisible} />;
  if (page.kind === "form") return <FormBody page={page} />;
  if (page.kind === "analysis") return <AnalysisBody page={page} />;
  if (page.kind === "document") return <DocumentBody page={page} listVisible={listVisible} />;
  if (page.kind === "production") return <ProductionBody page={page} />;
  if (page.kind === "modal") return <ModalBody module={module} page={page} />;
  return <TableBody page={page} />;
}

function TableBody({ page }: { page: PageTemplate }) {
  return (
    <PanelCard title={page.title} bodyClassName="p-0">
      <DataTable rows={rows} columns={columns} visibleColumns={["owner", "status", "updated"]} rowKey={(row) => row.id} density="compact" />
    </PanelCard>
  );
}

function SplitBody({ module, page, listVisible }: { module: ModuleTemplate; page: PageTemplate; listVisible: boolean }) {
  return (
    <div className={`grid gap-3 ${listVisible ? "lg:grid-cols-[3fr_7fr]" : "lg:grid-cols-1"}`}>
      {listVisible && (
        <PanelCard title="目录" bodyClassName="space-y-2 p-3">
          {rows.map((row) => (
            <button key={row.id} type="button" className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 first:border-emerald-400 first:bg-emerald-50">
              <span>{row.name}</span>
              <span className="text-xs text-slate-400">{row.updated}</span>
            </button>
          ))}
        </PanelCard>
      )}
      <PanelCard title={page.title} subtitle={module.summary} bodyClassName="space-y-4 p-4">
        <FormGrid fields={["编码", "名称", "负责人", "状态", "范围", "更新时间"]} />
      </PanelCard>
    </div>
  );
}

function FormBody({ page }: { page: PageTemplate }) {
  return (
    <PanelCard title={page.title} actions={<ActionButton variant="primary">保存</ActionButton>} bodyClassName="p-4">
      <FormGrid fields={["编码", "名称", "分类", "负责人", "开始日期", "结束日期", "状态", "备注", "来源"]} />
    </PanelCard>
  );
}

function AnalysisBody({ page }: { page: PageTemplate }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="本月" value="128" />
        <MetricCard label="同比" value="+12%" />
        <MetricCard label="预警" value="3" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <AnalysisBlock title={page.title} bodyClassName="h-48 bg-slate-50">
          <ChartBars />
        </AnalysisBlock>
        <AnalysisBlock title="分布" bodyClassName="h-48 bg-slate-50">
          <ChartBars compact />
        </AnalysisBlock>
      </div>
    </div>
  );
}

function ChartBars({ compact = false }: { compact?: boolean }) {
  const widths = compact ? ["70%", "48%", "82%", "58%"] : ["86%", "62%", "74%", "45%"];
  return (
    <div className="flex h-full flex-col justify-end gap-3">
      {widths.map((width, index) => (
        <div key={width} className="flex items-center gap-3">
          <span className="w-10 text-xs font-semibold text-slate-400">{index + 1}</span>
          <span className="h-3 rounded-full bg-emerald-200" style={{ width }} />
        </div>
      ))}
    </div>
  );
}

function DocumentBody({ page, listVisible }: { page: PageTemplate; listVisible: boolean }) {
  return (
    <div className={`grid gap-3 ${listVisible ? "lg:grid-cols-[3fr_7fr]" : "lg:grid-cols-1"}`}>
      {listVisible && (
        <PanelCard title="目录" bodyClassName="space-y-2 p-3">
          {["01 基本制度", "02 操作规范", "03 附件资料"].map((name) => (
            <div key={name} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">{name}</div>
          ))}
        </PanelCard>
      )}
      <PanelCard title={page.title} bodyClassName="space-y-3 p-4">
        <div className="h-64 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
          <div className="mb-3 h-3 w-40 rounded bg-slate-300" />
          <div className="space-y-2">
            <div className="h-2 rounded bg-slate-200" />
            <div className="h-2 w-5/6 rounded bg-slate-200" />
            <div className="h-2 w-2/3 rounded bg-slate-200" />
          </div>
        </div>
      </PanelCard>
    </div>
  );
}

function ProductionBody({ page }: { page: PageTemplate }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[4fr_6fr]">
      <PanelCard title={page.title} bodyClassName="p-4">
        <FormGrid fields={["批号", "检验项", "结果", "单位", "判定", "备注"]} columns="grid-cols-1" />
      </PanelCard>
      <PanelCard title="预览" bodyClassName="p-4">
        <TableBody page={{ ...page, title: "记录明细" }} />
      </PanelCard>
    </div>
  );
}

function ModalBody({ module, page }: { module: ModuleTemplate; page: PageTemplate }) {
  return (
    <div className="relative rounded-lg border border-slate-200 bg-slate-50 p-6">
      <TableBody page={{ ...page, title: module.label }} />
      <div className="absolute inset-0 grid place-items-center bg-slate-900/10 p-6">
        <PanelCard title={page.title} actions={<ActionButton variant="primary">确认</ActionButton>} bodyClassName="w-[34rem] max-w-full space-y-3 p-4">
          <FormGrid fields={["名称", "类型", "负责人", "状态"]} columns="grid-cols-2" />
        </PanelCard>
      </div>
    </div>
  );
}

function FormGrid({ fields, columns = "md:grid-cols-3" }: { fields: string[]; columns?: string }) {
  return (
    <div className={`grid gap-3 ${columns}`}>
      {fields.map((field, index) => (
        <FormField key={field} label={field} required={index < 2}>
          <TextField value={index < 2 ? `示例${index + 1}` : ""} onChange={() => {}} placeholder={field} readOnly />
        </FormField>
      ))}
    </div>
  );
}
