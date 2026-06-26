"use client";

import { CommandButton, FormField, InputControl, SectionCard } from "@workspace/core/ui";
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
  return <SectionCard title="上传文件" className="mb-6" bodyClassName="p-6">
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label="公司">
          <InputControl
            spec={{
              valueType: "string",
              editor: "select",
              options: {
                source: "static",
                mode: "dropdown",
                items: companies.map(c => ({ value: c.code, label: `${c.code} ${c.name}` })),
              },
            }}
            value={companyCode}
            onChange={(value) => onCompanyChange(String(value ?? ""))}
            placeholder="请选择公司"
          />
        </FormField>
        <FormField label="导入类型">
          <InputControl
            spec={{
              valueType: "string",
              editor: "select",
              options: {
                source: "static",
                mode: "dropdown",
                items: [
                  { value: "balance", label: "余额表" },
                  { value: "journal", label: "序时账" },
                  { value: "account", label: "科目表" },
                ],
              },
            }}
            value={importType}
            onChange={(value) => onTypeChange(value as "balance" | "journal" | "account")}
          />
        </FormField>
        <FormField label="年度">
          <InputControl
            spec={{
              valueType: "string",
              editor: "select",
              options: {
                source: "static",
                mode: "dropdown",
                items: [
                  { value: "2024", label: "2024" },
                  { value: "2025", label: "2025" },
                  { value: "2026", label: "2026" },
                ],
              },
            }}
            value={year}
            onChange={(value) => onYearChange(String(value ?? ""))}
          />
        </FormField>
        <FormField label="Excel 文件" className="sm:col-span-3">
          <InputControl
            spec={{ valueType: "file", editor: "upload" }}
            accept=".xls,.xlsx"
            onChange={(fileValue) => onFileChange(fileValue instanceof File ? fileValue : null)}
          />
        </FormField>
      </div>

      {importType === "balance" && <p className="mb-4 text-sm text-blue-700">
          余额表按年度快照导入：2024 年作为月度余额滚动计算基准，2025 年及之后作为校准快照，不直接覆盖月度余额表。
        </p>}

      <div className="flex items-center gap-3">
        <CommandButton variant="primary" onClick={onPreview} disabled={!file || !companyCode || loading}>
          {loading ? "解析中..." : "预览数据"}
        </CommandButton>
        {file && <span className="text-xs text-gray-400">
            {(file.size / 1024).toFixed(1)} KB
          </span>}
      </div>
    </SectionCard>;
}
