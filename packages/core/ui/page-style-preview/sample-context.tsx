"use client";

import { createContext, type ReactNode, useContext } from "react";

export interface PreviewRow {
  id: string;
  code: string;
  name: string;
  owner: string;
  type: string;
  scope: string;
  status: string;
  updated: string;
}

export interface PreviewOption {
  value: string;
  label: string;
  searchText?: string;
}

export interface QcPaperPreviewSample {
  title: string;
  rows: string[][];
  templateRows: string[][];
  basis: string;
  sectionLabel: string;
  stageTabs: string[];
  products: Array<{ name: string; count: string }>;
}

export interface PageStylePreviewSamples {
  previewRows: PreviewRow[];
  optionValues: PreviewOption[];
  referenceValues: PreviewOption[];
  fieldValues: Record<string, string>;
  documentItems: string[];
  qcPaper: QcPaperPreviewSample;
}

const defaultSamples: PageStylePreviewSamples = {
  previewRows: [
    { id: "1", code: "A001", name: "示例主数据", owner: "示例负责人", type: "标准", scope: "内部", status: "现用", updated: "06-18" },
    { id: "2", code: "A018", name: "示例复核项", owner: "示例人员", type: "复核", scope: "公开", status: "待确认", updated: "06-12" },
    { id: "3", code: "A092", name: "示例归档项", owner: "示例人员", type: "历史", scope: "内部", status: "归档", updated: "05-30" },
  ],
  optionValues: [
    { value: "全部", label: "全部" },
    { value: "现用", label: "现用" },
    { value: "归档", label: "归档" },
    { value: "内部", label: "内部" },
    { value: "公开", label: "公开" },
    { value: "标准", label: "标准" },
    { value: "复核", label: "复核" },
  ],
  referenceValues: [
    { value: "示例组织", label: "示例组织", searchText: "shi li zu zhi" },
    { value: "示例角色", label: "示例角色", searchText: "shi li jue se" },
    { value: "示例负责人", label: "示例负责人", searchText: "shi li fu ze ren" },
  ],
  fieldValues: {},
  documentItems: ["01 示例目录", "02 示例资料", "03 示例附件"],
  qcPaper: {
    title: "一、示例记录项",
    rows: [
      ["条目名称", "示例样品", "包装情况", "示例包装"],
      ["检验目的", "示例目的", "检品数量", "12"],
      ["提交组织", "示例组织", "请验日期", "2026 年 06 月 20 日"],
      ["检验日期", "2026 年 06 月 20 日", "报告日期", "2026 年 06 月 20 日"],
    ],
    templateRows: [
      ["条目名称", "示例样品", "包装情况", "示例包装"],
      ["检验目的", "示例目的", "检品数量", "i"],
      ["提交组织", "示例组织", "请验日期", "date"],
      ["检验日期", "date", "报告日期", "date"],
    ],
    basis: "《示例质量标准》（STD000001）、《示例操作规程》（SOP000001）",
    sectionLabel: "1.1 示例分节",
    stageTabs: ["检验前确认", "2.1 性状", "2.2 水分", "2.3 含量"],
    products: [
      { name: "示例产品 A", count: "11" },
      { name: "示例产品 B", count: "14" },
      { name: "示例产品 C", count: "13" },
    ],
  },
};

const PageStylePreviewSampleContext = createContext<PageStylePreviewSamples>(defaultSamples);

export function PageStylePreviewSampleProvider({
  samples,
  children,
}: {
  samples?: PageStylePreviewSamples;
  children: ReactNode;
}) {
  return (
    <PageStylePreviewSampleContext.Provider value={samples ?? defaultSamples}>
      {children}
    </PageStylePreviewSampleContext.Provider>
  );
}

export function usePageStylePreviewSamples() {
  return useContext(PageStylePreviewSampleContext);
}
