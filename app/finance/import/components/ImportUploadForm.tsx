"use client";

import { SelectField } from "@workspace/core/ui";
import { Company } from "./types";

interface ImportUploadFormProps {
  companies: Company[];
  companyCode: string;
  importType: "balance" | "journal" | "account";
  year: string;
  file: File | null;
  dragActive: boolean;
  loading: boolean;
  onCompanyChange: (code: string) => void;
  onTypeChange: (type: "balance" | "journal" | "account") => void;
  onYearChange: (year: string) => void;
  onFileChange: (file: File | null) => void;
  onDragStateChange: (active: boolean) => void;
  onPreview: () => void;
}

export default function ImportUploadForm({
  companies,
  companyCode,
  importType,
  year,
  file,
  dragActive,
  loading,
  onCompanyChange,
  onTypeChange,
  onYearChange,
  onFileChange,
  onDragStateChange,
  onPreview,
}: ImportUploadFormProps) {
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      onDragStateChange(true);
    } else if (e.type === "dragleave") {
      onDragStateChange(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragStateChange(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileChange(e.target.files[0]);
    }
  };

  return (
    <div className="mb-6 rounded-lg bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">上传文件</h2>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Company */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-600">公司</label>
          <SelectField
            value={companyCode}
            onChange={onCompanyChange}
            placeholder="请选择公司"
            options={companies.map((c) => ({ value: c.code, label: `${c.code} ${c.name}` }))}
            selectClassName="px-3 py-2 text-sm"
          />
        </div>

        {/* Type */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-600">导入类型</label>
          <SelectField
            value={importType}
            onChange={(nextValue) =>
              onTypeChange(nextValue as "balance" | "journal" | "account")
            }
            options={[
              { value: "balance", label: "余额表" },
              { value: "journal", label: "序时账" },
              { value: "account", label: "科目表" },
            ]}
            selectClassName="px-3 py-2 text-sm"
          />
        </div>

        {/* Year */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-600">年度</label>
          <SelectField
            value={year}
            onChange={onYearChange}
            options={[
              { value: "2024", label: "2024" },
              { value: "2025", label: "2025" },
              { value: "2026", label: "2026" },
            ]}
            selectClassName="px-3 py-2 text-sm"
          />
        </div>

        {/* File */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-600">Excel 文件</label>
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed px-3 py-2 transition-colors ${
              dragActive
                ? "border-emerald-400 bg-emerald-50"
                : file
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-gray-300 bg-gray-50 hover:border-gray-400"
            }`}
          >
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
              <input
                type="file"
                accept=".xls,.xlsx"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <span>
                {file
                  ? `已选择：${file.name}`
                  : "点击选择或拖拽 Excel 文件"}
              </span>
            </label>
          </div>
        </div>
      </div>

      {importType === "balance" && (
        <p className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
          余额表按年度快照导入：2024 年作为月度余额滚动计算基准，2025 年及之后作为校准快照，不直接覆盖月度余额表。
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={onPreview}
          disabled={!file || !companyCode || loading}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-gray-300"
        >
          {loading ? "解析中..." : "预览数据"}
        </button>
        {file && (
          <span className="text-xs text-gray-400">
            {(file.size / 1024).toFixed(1)} KB
          </span>
        )}
      </div>
    </div>
  );
}
