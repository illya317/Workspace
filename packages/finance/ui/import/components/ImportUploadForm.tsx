"use client";

import { PageSurface, createPageFieldsBlock } from "@workspace/core/ui";
import type { Company } from "./types";
interface ImportUploadFormProps {
  companies: Company[];
  companyCode: string;
  importType: "balance" | "journal" | "account";
  year: string;
  file: File | null;
  loading: boolean;
  onCompanyChange: (code: string) => void;
  onTypeChange: (type: "balance" | "journal" | "account") => void;
  onYearChange: (year: string) => void;
  onFileChange: (file: File | null) => void;
  onPreview: () => void;
}
export default function ImportUploadForm({
  companies,
  companyCode,
  importType,
  year,
  file,
  loading,
  onCompanyChange,
  onTypeChange,
  onYearChange,
  onFileChange,
  onPreview
}: ImportUploadFormProps) {
  return <div className="mb-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-800">上传文件</h2>
      </div>
      <PageSurface
        kind="list"
        embedded
        blocks={[
          createPageFieldsBlock("import-upload", [
            {
              key: "company",
              label: "公司",
              spec: {
                valueType: "string",
                control: "choice",
                options: {
                  source: "static",
                  mode: "dropdown",
                  items: companies.map(c => ({ value: c.code, label: `${c.code} ${c.name}` })),
                },
              },
              value: companyCode,
              onChange: (value) => onCompanyChange(String(value ?? "")),
              placeholder: "请选择公司",
            },
            {
              key: "type",
              label: "导入类型",
              spec: {
                valueType: "string",
                control: "choice",
                options: {
                  source: "static",
                  mode: "dropdown",
                  items: [
                    { value: "balance", label: "余额表" },
                    { value: "journal", label: "序时账" },
                    { value: "account", label: "科目表" },
                  ],
                },
              },
              value: importType,
              onChange: (value) => onTypeChange(value as "balance" | "journal" | "account"),
            },
            {
              key: "year",
              label: "年度",
              spec: {
                valueType: "string",
                control: "choice",
                options: {
                  source: "static",
                  mode: "dropdown",
                  items: [
                    { value: "2024", label: "2024" },
                    { value: "2025", label: "2025" },
                    { value: "2026", label: "2026" },
                  ],
                },
              },
              value: year,
              onChange: (value) => onYearChange(String(value ?? "")),
            },
            {
              key: "file",
              label: "Excel 文件",
              spec: { valueType: "file", control: "file" },
              accept: ".xls,.xlsx",
              onChange: (fileValue) => onFileChange(fileValue instanceof File ? fileValue : null),
              span: 3,
            },
          ], {
            columns: 3,
            actions: [{
              key: "preview",
              label: loading ? "解析中..." : "预览数据",
              variant: "primary",
              onClick: onPreview,
              disabled: !file || !companyCode || loading,
            }],
          }),
        ]}
      />

      {importType === "balance" && <p className="mb-4 text-sm text-blue-700">
          余额表按年度快照导入：2024 年作为月度余额滚动计算基准，2025 年及之后作为校准快照，不直接覆盖月度余额表。
        </p>}

      {file && <span className="text-xs text-gray-400">
          {(file.size / 1024).toFixed(1)} KB
        </span>}
    </div>;
}
