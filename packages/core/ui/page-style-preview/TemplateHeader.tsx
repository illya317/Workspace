"use client";

import { PanelCard } from "../BaseCards";
import StatusBadge from "../StatusBadge";
import type { PageTemplate } from "./template-data";

const kindLabels: Record<PageTemplate["kind"], string> = {
  overview: "结构",
  table: "数据库",
  split: "左右分栏",
  form: "详情表单",
  analysis: "分析",
  document: "文档",
  production: "填写预览",
  upload: "上传",
};

export default function TemplateHeader({
  page,
}: {
  page: PageTemplate;
}) {
  return (
    <PanelCard bodyClassName="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-950">{page.title}</h2>
            <StatusBadge label={kindLabels[page.kind]} variant="blue" />
          </div>
          <p className="mt-1 text-sm text-slate-500">{page.label}</p>
        </div>
      </div>
    </PanelCard>
  );
}
