"use client";

import Pagination from "../Pagination";
import type { PageTemplate } from "./template-data";

export default function TemplateFooter({
  page,
  pageNumber,
  onPageChange,
}: {
  page: PageTemplate;
  pageNumber: number;
  onPageChange: (page: number) => void;
}) {
  if (page.kind === "modal") return null;
  if (page.kind === "home") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm">
        共 {pageNumber + 7} 个入口
      </div>
    );
  }
  if (page.kind === "document" || page.kind === "production" || page.kind === "upload") {
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm">
        <span>{page.kind === "upload" ? "待确认" : "预览"}</span>
        <span>{page.kind === "upload" ? "3 条记录" : "已保存"}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <span className="text-xs font-semibold text-slate-500">第 {pageNumber} / 8 页，共 86 条</span>
      <Pagination page={pageNumber} totalPages={8} total={86} onPageChange={onPageChange} compact />
    </div>
  );
}
