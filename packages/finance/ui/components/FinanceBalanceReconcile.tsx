"use client";

import { useEffect, useState } from "react";
import { workspacePath } from "@workspace/core/routing";
import {
  createPageBody,
  PageSurface,
  createPageDataBlock,
  createInlineFieldsBlock,
  createPageTableBlock,
  type DataSurfaceColumnSpec,
} from "@workspace/core/ui";
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
  missingInSystem: {
    code: string;
    name: string;
  }[];
  missingInExcel: {
    code: string;
    name: string;
  }[];
}
export default function FinanceBalanceReconcile({
  showToast
}: {
  showToast: (message: string, type?: "success" | "error") => void;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyCode, setCompanyCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReconcileResult | null>(null);
  useEffect(() => {
    fetch(workspacePath("/api/modules/hr/roster/companies")).then(response => response.json()).then(data => {
      const list = (data.companies || []) as Company[];
      setCompanies(list);
      if (list.length) setCompanyCode(list[0].code);
    }).catch(() => {});
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
      const response = await fetch(workspacePath("/api/modules/finance/ledger/balances/reconcile"), {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (data.success) setResult(data.result);else showToast(data.error || "核对失败", "error");
    } catch {
      showToast("网络错误", "error");
    } finally {
      setLoading(false);
    }
  }
  return <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-800">余额核对（与会计软件年度余额表比对）</h2>
        <p className="text-sm text-slate-500">
          系统侧使用 2024
          年度余额表作为基准，再叠加序时账凭证滚动计算；上传 2025/2026
          年度余额表用于校验差异。
        </p>
      </div>
      <PageSurface
        kind="list"
        embedded
        body={createPageBody([
          createInlineFieldsBlock("balance-reconcile-filters", [
            {
              key: "company",
              label: "公司",
              spec: { valueType: "string", control: "choice", options: { source: "static", mode: "dropdown", items: companies.map(company => ({ value: company.code, label: company.name })) } },
              value: companyCode,
              onChange: (value) => setCompanyCode(String(value ?? "")),
            },
            {
              key: "file",
              label: "余额表Excel",
              spec: { valueType: "file", control: "file" },
              accept: ".xls,.xlsx",
              onChange: (fileValue) => setFile(fileValue instanceof File ? fileValue : null),
            },
          ], {
            kind: "filters",
            actions: [{ key: "reconcile", label: loading ? "核对中..." : "开始核对", variant: "primary", onClick: handleReconcile, disabled: loading }],
          }),
        ])}
      />

      {result && <div className="mt-4 space-y-3">
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

          {result.missingInSystem.length > 0 && <MissingList title={`Excel中有但系统中缺失的科目（${result.missingInSystem.length}个）`} items={result.missingInSystem} tone="yellow" />}
          {result.missingInExcel.length > 0 && <MissingList title={`系统中有但Excel中缺失的科目（${result.missingInExcel.length}个）`} items={result.missingInExcel} tone="blue" />}
          {result.differences.length > 0 && <DiffTable differences={result.differences} />}
          {result.differences.length === 0 && result.missingInSystem.length === 0 && result.missingInExcel.length === 0 && <BalanceReconcileSuccess />}
        </div>}
    </section>;
}

function BalanceReconcileSuccess() {
  return <PageSurface kind="list" embedded body={createPageBody([createPageDataBlock("balance-reconcile-empty", { kind: "records", records: [], empty: "核对通过，所有科目余额完全一致" })])} />;
}

function MissingList({
  title,
  items,
  tone
}: {
  title: string;
  items: {
    code: string;
    name: string;
  }[];
  tone: "yellow" | "blue";
}) {
  const styles = tone === "yellow" ? "border-amber-100 bg-amber-50 text-amber-800 [&_p:last-child]:text-amber-700" : "border-blue-100 bg-blue-50 text-blue-800 [&_p:last-child]:text-blue-700";
  return <section className={`${styles} rounded border p-3 text-sm`}>
      <p className="font-medium">{title}</p>
      <p className="mt-1">
        {items.map(item => `${item.code} ${item.name}`).join("、 ")}
      </p>
    </section>;
}
function DiffTable({
  differences
}: {
  differences: ReconcileDiff[];
}) {
  const columns: DataSurfaceColumnSpec<ReconcileDiff>[] = [{
    key: "accountCode",
    label: "科目编码",
    required: true,
    cellClassName: "font-mono text-slate-700",
    cell: difference => difference.accountCode
  }, {
    key: "accountName",
    label: "科目名称",
    required: true,
    cell: difference => difference.accountName
  }, {
    key: "field",
    label: "差异项",
    defaultVisible: true,
    cellClassName: "text-slate-600",
    cell: difference => difference.field
  }, {
    key: "excelValue",
    label: "Excel",
    defaultVisible: true,
    headerClassName: "text-right",
    cellClassName: "text-right",
    cell: difference => difference.excelValue.toFixed(2)
  }, {
    key: "systemValue",
    label: "系统",
    defaultVisible: true,
    headerClassName: "text-right",
    cellClassName: "text-right",
    cell: difference => difference.systemValue.toFixed(2)
  }, {
    key: "diff",
    label: "差额",
    defaultVisible: true,
    headerClassName: "text-right",
    cellClassName: "text-right font-medium text-red-600",
    cell: difference => difference.diff.toFixed(2)
  }];
  return <PageSurface
    kind="list"
    embedded
    body={createPageBody([
      createPageTableBlock("balance-reconcile-differences", {
        framed: true,
        className: "overflow-hidden",
        bodyClassName: "overflow-x-auto",
        rows: differences,
        columns,
        visibleColumns: columns.map(column => column.key),
        rowKey: difference => `${difference.accountCode}-${difference.field}`,
      }),
    ])}
  />;
}
