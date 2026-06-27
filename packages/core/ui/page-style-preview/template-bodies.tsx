"use client";

import type { ReactNode } from "react";
import { AnalysisBlock, MetricCard, PanelCard } from "../BaseCards";
import Badge from "../Badge";
import { getToolbarActionClassName } from "../toolbar-styles";
import QcPaperPreview from "./QcPaperPreview";
import { PreviewTable } from "./sample-data";
import { usePageStylePreviewSamples } from "./sample-context";
import { DetailStats, FormGrid } from "./template-fields";
import type { EmbeddedTemplate, ModuleTemplate, PageTemplate } from "./template-data";

function PreviewTextButton({ children, variant = "secondary" }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" }) {
  return <button type="button" className={getToolbarActionClassName(variant)}>{children}</button>;
}

function RightPrioritySplit({ className, left, right }: { className: string; left: ReactNode; right: ReactNode }) {
  return (
    <div className={`grid gap-3 ${className}`}>
      {left ? <div className="min-w-0 max-lg:order-last">{left}</div> : null}
      <div className="min-w-0">{right}</div>
    </div>
  );
}

export function TemplateBody({
  module,
  page,
  listVisible,
}: {
  module: ModuleTemplate;
  page: PageTemplate;
  listVisible: boolean;
}) {
  let body: ReactNode = <TableBody page={page} />;
  if (page.kind === "split") body = <SplitBody module={module} page={page} listVisible={listVisible} />;
  if (page.kind === "form") body = <FormBody page={page} />;
  if (page.kind === "analysis") body = <AnalysisBody page={page} />;
  if (page.kind === "document") body = <DocumentBody page={page} listVisible={listVisible} />;
  if (page.kind === "production") body = <ProductionBody page={page} />;
  if (page.kind === "upload") body = <UploadBody page={page} />;
  return <BodyWithEmbedded page={page}>{body}</BodyWithEmbedded>;
}

function BodyWithEmbedded({ page, children }: { page: PageTemplate; children: ReactNode }) {
  if (!page.embedded) return <>{children}</>;
  return (
    <div className="space-y-3">
      {children}
      <EmbeddedDetail detail={page.embedded} />
    </div>
  );
}

function EmbeddedDetail({ detail }: { detail: EmbeddedTemplate }) {
  const { qcPaper } = usePageStylePreviewSamples();
  if (detail.kind === "production") {
    const templateMode = detail.paperMode === "template";
    return (
      <PanelCard
        title={detail.title}
        actions={templateMode ? <PreviewTextButton>开发模式</PreviewTextButton> : <PreviewTextButton>预览</PreviewTextButton>}
        bodyClassName="space-y-4 p-4"
      >
        <div className="flex flex-wrap gap-2">
          {qcPaper.stageTabs.map((item, index) => (
            <span key={item} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${index === 0 ? "bg-slate-200 text-slate-900" : "bg-slate-100 text-slate-500"}`}>
              {item}
            </span>
          ))}
        </div>
        <QcPaperPreview mode={templateMode ? "template" : "record"} />
      </PanelCard>
    );
  }
  if (detail.kind === "document") {
    return <PanelCard title={detail.title} bodyClassName="p-4"><DocumentSurface /></PanelCard>;
  }
  return (
    <PanelCard title={detail.title} actions={<EmbeddedActions detail={detail} />} bodyClassName="space-y-4 p-4">
      <FormGrid fields={detail.fields ?? ["编码", "名称", "负责人", "状态", "开始日期", "结束日期", "备注"]} />
    </PanelCard>
  );
}

function EmbeddedActions({ detail }: { detail: EmbeddedTemplate }) {
  return (
    <>
      {detail.previewAction && <PreviewTextButton>预览</PreviewTextButton>}
      <PreviewTextButton variant="primary">保存</PreviewTextButton>
    </>
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
  const { previewRows } = usePageStylePreviewSamples();
  const listItems = page.listItems ?? previewRows.map((row) => row.name);

  return (
    <RightPrioritySplit
      className={listVisible ? "lg:grid-cols-[3fr_7fr]" : "lg:grid-cols-1"}
      left={listVisible ? (
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
      ) : null}
      right={<PanelCard title={page.title} subtitle={module.summary} bodyClassName="space-y-4 p-4">
        <FormGrid fields={page.fields ?? ["编码", "名称", "负责人", "状态", "范围", "类型", "级别", "更新时间"]} />
        {/部门|岗位|架构/.test(page.title) && <DetailStats items={["直属岗位", "总岗位", "直属编制", "总编制"]} />}
      </PanelCard>}
    />
  );
}

function FormBody({ page }: { page: PageTemplate }) {
  const fields = page.fields ?? ["编码", "名称", "分类", "负责人", "开始日期", "结束日期", "状态", "来源", "级别", "范围", "备注", "更新人"];
  const firstFields = fields.slice(0, 9);
  const restFields = fields.slice(9);
  const actions = (
    <>
      {page.previewAction && <PreviewTextButton>预览</PreviewTextButton>}
      <PreviewTextButton variant="primary">保存</PreviewTextButton>
    </>
  );

  return (
    <PanelCard title={page.title} actions={actions} bodyClassName="space-y-4 p-4">
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
      <RightPrioritySplit
        className="lg:grid-cols-[6fr_4fr]"
        left={<AnalysisBlock title={page.title} bodyClassName="h-48 bg-slate-50">
          <ChartBars />
        </AnalysisBlock>}
        right={<AnalysisBlock title="分布" bodyClassName="h-48 bg-slate-50">
          <ChartBars compact />
        </AnalysisBlock>}
      />
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
  const { documentItems } = usePageStylePreviewSamples();
  return (
    <RightPrioritySplit
      className={listVisible ? "lg:grid-cols-[3fr_7fr]" : "lg:grid-cols-1"}
      left={listVisible ? (
        <PanelCard title="目录" bodyClassName="space-y-2 p-3">
          {documentItems.map((name) => (
            <div key={name} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">{name}</div>
          ))}
        </PanelCard>
      ) : null}
      right={<PanelCard title={page.title} bodyClassName="space-y-3 p-4">
        <DocumentSurface />
      </PanelCard>}
    />
  );
}

function DocumentSurface() {
  return (
    <div className="min-h-80 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-600">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="h-3 w-40 rounded bg-slate-300" />
        <Badge label="预览" tone="blue" />
      </div>
      <div className="space-y-2">
        <div className="h-2 rounded bg-slate-200" />
        <div className="h-2 w-5/6 rounded bg-slate-200" />
        <div className="h-2 w-2/3 rounded bg-slate-200" />
        <div className="h-2 w-4/5 rounded bg-slate-200" />
        <div className="h-2 w-3/5 rounded bg-slate-200" />
      </div>
    </div>
  );
}

function ProductionBody({ page }: { page: PageTemplate }) {
  const { qcPaper } = usePageStylePreviewSamples();
  const templateMode = page.paperMode === "template";

  return (
    <RightPrioritySplit
      className="lg:grid-cols-[3fr_7fr]"
      left={<PanelCard title="产品" bodyClassName="space-y-2 p-3">
        {qcPaper.products.map((item) => (
          <button key={item.name} type="button" className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-semibold text-slate-800 first:border-emerald-400 first:bg-emerald-50">
            <span>{item.name}</span>
            <span className="text-xs text-slate-400">{item.count} 项</span>
          </button>
        ))}
      </PanelCard>}
      right={<PanelCard
        title={templateMode ? `布局预览：${qcPaper.title.replace(/^一、/, "")}` : page.title}
        actions={templateMode ? <PreviewTextButton>开发模式</PreviewTextButton> : <PreviewTextButton variant="primary">提交</PreviewTextButton>}
        bodyClassName="space-y-4 p-4"
      >
        <div className="flex flex-wrap gap-2">
          {qcPaper.stageTabs.map((item, index) => (
            <span key={item} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${index === 0 ? "bg-slate-200 text-slate-900" : "bg-slate-100 text-slate-500"}`}>
              {item}
            </span>
          ))}
        </div>
        <QcPaperPreview mode={templateMode ? "template" : "record"} />
      </PanelCard>}
    />
  );
}
function UploadBody({ page }: { page: PageTemplate }) {
  return (
    <RightPrioritySplit
      className="lg:grid-cols-[4fr_6fr]"
      left={<PanelCard title={page.title} bodyClassName="space-y-3 p-4">
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
          <div className="text-sm font-semibold text-slate-800">选择文件</div>
          <div className="mt-1 text-xs text-slate-400">Excel / PDF / Word</div>
        </div>
        <FormGrid fields={page.fields ?? ["类型", "来源", "负责人", "范围"]} columns="grid-cols-2" />
      </PanelCard>}
      right={<PanelCard title="导入预览" bodyClassName="p-0">
        <PreviewTable columns={["负责人", "类型", "状态", "更新时间"]} />
      </PanelCard>}
    />
  );
}
