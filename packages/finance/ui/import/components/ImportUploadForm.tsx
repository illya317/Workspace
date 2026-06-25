"use client";

import { ActionButton, FileField, SectionCard, SelectField } from "@workspace/core/ui";
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
  onPreview,
}: ImportUploadFormProps) {
  return (
    <SectionCard title="上传文件" className="mb-6" bodyClassName="p-6">
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SelectField
          label="公司"
          value={companyCode}
          onChange={onCompanyChange}
          placeholder="请选择公司"
          options={companies.map((c) => ({ value: c.code, label: `${c.code} ${c.name}` }))}
        />
        <SelectField
          label="导入类型"
          value={importType}
          onChange={(nextValue) =>
            onTypeChange(nextValue as "balance" | "journal" | "account")
          }
          options={[
            { value: "balance", label: "余额表" },
            { value: "journal", label: "序时账" },
            { value: "account", label: "科目表" },
          ]}
        />
        <SelectField
          label="年度"
          value={year}
          onChange={onYearChange}
          options={[
            { value: "2024", label: "2024" },
            { value: "2025", label: "2025" },
            { value: "2026", label: "2026" },
          ]}
        />
        <FileField
          label="Excel 文件"
          accept=".xls,.xlsx"
          onChange={onFileChange}
          className="sm:col-span-3"
        />
      </div>

      {importType === "balance" && (
        <p className="mb-4 text-sm text-blue-700">
          余额表按年度快照导入：2024 年作为月度余额滚动计算基准，2025 年及之后作为校准快照，不直接覆盖月度余额表。
        </p>
      )}

      <div className="flex items-center gap-3">
        <ActionButton onClick={onPreview} disabled={!file || !companyCode || loading} variant="primary">
          {loading ? "解析中..." : "预览数据"}
        </ActionButton>
        {file && (
          <span className="text-xs text-gray-400">
            {(file.size / 1024).toFixed(1)} KB
          </span>
        )}
      </div>
    </SectionCard>
  );
}
