"use client";

import { useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import SelectField from "@workspace/core/ui/SelectField";

interface Company {
  code: string;
  name: string;
}

interface ReconcileDiff {
  accountCode: string;
  accountName: string;
  field: string;
  excelValue: number;
  systemValue: number;
  diff: number;
}

interface ReconcileResult {
  year: number;
  monthStart: number;
  monthEnd: number;
  companyCode: string;
  excelRowCount: number;
  systemAccountCount: number;
  matchedCount: number;
  differences: ReconcileDiff[];
  missingInSystem: { code: string; name: string }[];
  missingInExcel: { code: string; name: string }[];
}

export default function FinanceBalanceReconcile({
  showToast,
}: {
  showToast: (message: string, type?: "success" | "error") => void;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyCode, setCompanyCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReconcileResult | null>(null);

  useEffect(() => {
    fetch(workspacePath("/api/hr/companies"))
      .then((response) => response.json())
      .then((data) => {
        const list = (data.companies || []) as Company[];
        setCompanies(list);
        if (list.length) setCompanyCode(list[0].code);
      })
      .catch(() => {});
  }, []);

  async function handleReconcile() {
    if (!file || !companyCode) {
      showToast("请选择公司和余额表文件", "error");
      return;
    }

    setLoading(true);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyCode", companyCode);

    try {
      const response = await fetch(
        workspacePath("/api/finance/balances/reconcile"),
        {
          method: "POST",
          body: formData,
        },
      );
      const data = await response.json();
      if (data.success) setResult(data.result);
      else showToast(data.error || "核对失败", "error");
    } catch {
      showToast("网络错误", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-base font-semibold text-gray-800">
        余额核对（与会计软件年度余额表比对）
      </h3>
      <p className="mb-3 text-xs text-gray-500">
        系统侧使用 2024
        年度余额表作为基准，再叠加序时账凭证滚动计算；上传 2025/2026
        年度余额表用于校验差异。
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-gray-500">公司</label>
          <SelectField
            value={companyCode}
            onChange={setCompanyCode}
            options={companies.map((company) => ({
              value: company.code,
              label: company.name,
            }))}
            selectClassName="min-w-32 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">余额表Excel</label>
          <input
            type="file"
            accept=".xls,.xlsx"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="text-sm"
          />
        </div>
        <button
          onClick={handleReconcile}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "核对中..." : "开始核对"}
        </button>
      </div>

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-gray-600">
              期间：
              <span className="font-medium text-gray-800">
                {result.year}年{result.monthStart}月-{result.monthEnd}月
              </span>
            </span>
            <span className="text-gray-600">
              Excel科目数：
              <span className="font-medium text-gray-800">
                {result.excelRowCount}
              </span>
            </span>
            <span className="text-gray-600">
              系统科目数：
              <span className="font-medium text-gray-800">
                {result.systemAccountCount}
              </span>
            </span>
            <span className="text-gray-600">
              一致科目数：
              <span className="font-medium text-green-600">
                {result.matchedCount}
              </span>
            </span>
            <span className="text-gray-600">
              差异科目数：
              <span className="font-medium text-red-600">
                {result.differences.length}
              </span>
            </span>
          </div>

          {result.missingInSystem.length > 0 && (
            <MissingList
              title={`Excel中有但系统中缺失的科目（${result.missingInSystem.length}个）`}
              items={result.missingInSystem}
              tone="yellow"
            />
          )}
          {result.missingInExcel.length > 0 && (
            <MissingList
              title={`系统中有但Excel中缺失的科目（${result.missingInExcel.length}个）`}
              items={result.missingInExcel}
              tone="blue"
            />
          )}
          {result.differences.length > 0 && (
            <DiffTable differences={result.differences} />
          )}
          {result.differences.length === 0 &&
            result.missingInSystem.length === 0 &&
            result.missingInExcel.length === 0 && (
              <p className="rounded-md bg-green-50 p-3 text-sm font-medium text-green-700">
                核对通过，所有科目余额完全一致
              </p>
            )}
        </div>
      )}
    </div>
  );
}

function MissingList({
  title,
  items,
  tone,
}: {
  title: string;
  items: { code: string; name: string }[];
  tone: "yellow" | "blue";
}) {
  const styles =
    tone === "yellow"
      ? "bg-yellow-50 text-yellow-800 [&_p:last-child]:text-yellow-700"
      : "bg-blue-50 text-blue-800 [&_p:last-child]:text-blue-700";
  return (
    <div className={`rounded-md p-3 text-sm ${styles}`}>
      <p className="font-medium">{title}</p>
      <p className="mt-1">
        {items.map((item) => `${item.code} ${item.name}`).join("、 ")}
      </p>
    </div>
  );
}

function DiffTable({ differences }: { differences: ReconcileDiff[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="border-b bg-red-50">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium text-red-800">
              科目编码
            </th>
            <th className="px-2 py-1.5 text-left font-medium text-red-800">
              科目名称
            </th>
            <th className="px-2 py-1.5 text-left font-medium text-red-800">
              差异项
            </th>
            <th className="px-2 py-1.5 text-right font-medium text-red-800">
              Excel
            </th>
            <th className="px-2 py-1.5 text-right font-medium text-red-800">
              系统
            </th>
            <th className="px-2 py-1.5 text-right font-medium text-red-800">
              差额
            </th>
          </tr>
        </thead>
        <tbody>
          {differences.map((difference, index) => (
            <tr key={index} className="border-b last:border-0">
              <td className="px-2 py-1.5 font-mono text-gray-700">
                {difference.accountCode}
              </td>
              <td className="px-2 py-1.5 text-gray-700">
                {difference.accountName}
              </td>
              <td className="px-2 py-1.5 text-gray-600">
                {difference.field}
              </td>
              <td className="px-2 py-1.5 text-right text-gray-700">
                {difference.excelValue.toFixed(2)}
              </td>
              <td className="px-2 py-1.5 text-right text-gray-700">
                {difference.systemValue.toFixed(2)}
              </td>
              <td className="px-2 py-1.5 text-right font-medium text-red-600">
                {difference.diff.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
