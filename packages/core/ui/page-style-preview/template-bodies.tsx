"use client";

import { ActionButton } from "../ActionControls";
import { AnalysisBlock, MetricCard, PanelCard } from "../BaseCards";
import DataTable from "../DataTable";
import StatusBadge from "../StatusBadge";
import { previewColumns, previewRows, PreviewTable } from "./sample-data";
import { DetailStats, FormGrid } from "./template-fields";
import { getPageGroups, type ModuleTemplate, type PageTemplate } from "./template-data";

export function TemplateBody({
  module,
  page,
  listVisible,
}: {
  module: ModuleTemplate;
  page: PageTemplate;
  listVisible: boolean;
}) {
  if (page.kind === "overview") return <OverviewBody module={module} />;
  if (page.kind === "split") return <SplitBody module={module} page={page} listVisible={listVisible} />;
  if (page.kind === "form") return <FormBody page={page} />;
  if (page.kind === "analysis") return <AnalysisBody page={page} />;
  if (page.kind === "document") return <DocumentBody page={page} listVisible={listVisible} />;
  if (page.kind === "production") return <ProductionBody page={page} />;
  if (page.kind === "upload") return <UploadBody page={page} />;
  return <TableBody page={page} />;
}

function OverviewBody({ module }: { module: ModuleTemplate }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {getPageGroups(module).map((group) => (
        <PanelCard key={group.key} title={group.label} bodyClassName="p-3">
          <div className="flex flex-wrap gap-2">
            {group.pages.map((page) => (
              <span key={page.key} className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {page.label}
              </span>
            ))}
          </div>
        </PanelCard>
      ))}
    </div>
  );
}

export function TableBody({ page }: { page: PageTemplate }) {
  return (
    <PanelCard title={page.title} bodyClassName="p-0">
      <PreviewTable columns={page.tableColumns} />
    </PanelCard>
  );
}

function SplitBody({ module, page, listVisible }: { module: ModuleTemplate; page: PageTemplate; listVisible: boolean }) {
  const listItems = page.listItems ?? previewRows.map((row) => row.name);

  return (
    <div className={`grid gap-3 ${listVisible ? "lg:grid-cols-[3fr_7fr]" : "lg:grid-cols-1"}`}>
      {listVisible && (
        <PanelCard title={page.group ?? "目录"} bodyClassName="space-y-2 p-3">
          {listItems.map((name, index) => (
            <button key={name} type="button" className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-800 first:border-emerald-400 first:bg-emerald-50">
              <span className="min-w-0">
                <span className="block truncate">{name}</span>
                <span className="mt-1 block text-xs font-medium text-slate-400">现用 · {index + 3} 项</span>
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{String(index + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </PanelCard>
      )}
      <PanelCard title={page.title} subtitle={module.summary} bodyClassName="space-y-4 p-4">
        <FormGrid fields={page.fields ?? ["编码", "名称", "负责人", "状态", "范围", "类型", "级别", "更新时间"]} />
        {/部门|岗位|架构/.test(page.title) && <DetailStats items={["直属岗位", "总岗位", "直属编制", "总编制"]} />}
      </PanelCard>
    </div>
  );
}

function FormBody({ page }: { page: PageTemplate }) {
  const fields = page.fields ?? ["编码", "名称", "分类", "负责人", "开始日期", "结束日期", "状态", "来源", "级别", "范围", "备注", "更新人"];
  const firstFields = fields.slice(0, 9);
  const restFields = fields.slice(9);

  return (
    <PanelCard title={page.title} actions={<ActionButton variant="primary">保存</ActionButton>} bodyClassName="space-y-4 p-4">
      <FormGrid fields={firstFields} />
      {restFields.length > 0 && (
        <div className="border-t border-slate-200 pt-4">
          <FormGrid fields={restFields} />
        </div>
      )}
    </PanelCard>
  );
}

function AnalysisBody({ page }: { page: PageTemplate }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="本月" value="128" />
        <MetricCard label="同比" value="+12%" />
        <MetricCard label="预警" value="3" />
        <MetricCard label="覆盖率" value="96%" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[6fr_4fr]">
        <AnalysisBlock title={page.title} bodyClassName="h-48 bg-slate-50">
          <ChartBars />
        </AnalysisBlock>
        <AnalysisBlock title="分布" bodyClassName="h-48 bg-slate-50">
          <ChartBars compact />
        </AnalysisBlock>
      </div>
      <PanelCard title="明细交叉表" bodyClassName="p-0">
        <PreviewTable columns={["分类", "数量", "占比", "状态"]} />
      </PanelCard>
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
        <div className="min-h-80 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-600">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="h-3 w-40 rounded bg-slate-300" />
            <StatusBadge label="预览" variant="blue" />
          </div>
          <div className="space-y-2">
            <div className="h-2 rounded bg-slate-200" />
            <div className="h-2 w-5/6 rounded bg-slate-200" />
            <div className="h-2 w-2/3 rounded bg-slate-200" />
            <div className="h-2 w-4/5 rounded bg-slate-200" />
            <div className="h-2 w-3/5 rounded bg-slate-200" />
          </div>
        </div>
      </PanelCard>
    </div>
  );
}

function ProductionBody({ page }: { page: PageTemplate }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[4fr_6fr]">
      <PanelCard title={page.title} actions={<ActionButton variant="primary">提交</ActionButton>} bodyClassName="space-y-4 p-4">
        <FormGrid fields={page.fields ?? ["批号", "检验项", "结果", "单位", "判定", "备注"]} columns="grid-cols-1" />
        <DetailStats items={["已填", "待复核", "异常", "附件"]} />
      </PanelCard>
      <PanelCard title="预览" bodyClassName="p-0">
        <PreviewTable columns={["检验项", "结果", "单位", "限度", "判定"]} />
      </PanelCard>
    </div>
  );
}

function UploadBody({ page }: { page: PageTemplate }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[4fr_6fr]">
      <PanelCard title={page.title} bodyClassName="space-y-3 p-4">
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
          <div className="text-sm font-semibold text-slate-800">选择文件</div>
          <div className="mt-1 text-xs text-slate-400">Excel / PDF / Word</div>
        </div>
        <FormGrid fields={page.fields ?? ["类型", "来源", "负责人", "范围"]} columns="grid-cols-2" />
      </PanelCard>
      <PanelCard title="导入预览" bodyClassName="p-0">
        <DataTable rows={previewRows} columns={previewColumns} visibleColumns={["owner", "type", "status", "updated"]} rowKey={(row) => row.id} density="compact" />
      </PanelCard>
    </div>
  );
}
