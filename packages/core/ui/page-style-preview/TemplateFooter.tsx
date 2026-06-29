"use client";

import Pagination from "../internal/common/Pagination";
import type { PageTemplate } from "./template-data";

function footerLabels(page: PageTemplate) {
  if (page.kind === "form") return ["已保存草稿", "字段完整度 12 / 15"];
  if (page.kind === "split") return ["当前详情", "4 项关联信息"];
  if (page.kind === "analysis") return ["分析口径", "本期 / 同比 / 预警"];
  if (page.kind === "document") return ["文档预览", "第 1 / 6 页"];
  if (page.kind === "production" && page.paperMode === "template") return ["版式预览", "对象 / 步骤 / 条目"];
  if (page.kind === "production") return ["填写预览", "已填 4 项"];
  if (page.kind === "upload") return ["导入预览", "3 条待确认"];
  return ["当前页面", "已同步"];
}

export default function TemplateFooter({
  page,
  pageNumber,
  onPageChange,
}: {
  page: PageTemplate;
  pageNumber: number;
  onPageChange: (page: number) => void;
}) {
  if (page.kind !== "table") {
    const [left, right] = footerLabels(page);
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    );
  }
  return (
    <Pagination page={pageNumber} totalPages={8} total={86} onPageChange={onPageChange} compact className="rounded-lg border border-slate-200 shadow-sm" />
  );
}
