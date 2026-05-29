"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import UserMenu from "@/app/components/UserMenu";
import { SessionUser } from "@/lib/types";

interface Company {
  id: number;
  code: string;
  name: string;
}

interface PreviewAccount {
  code: string;
  name: string;
  parentCode: string | null;
  category: string;
  balanceDirection: string;
}

interface PreviewBalance {
  accountCode: string;
  accountName: string;
  openingDebit: number;
  openingCredit: number;
  currentDebit: number;
  currentCredit: number;
  closingDebit: number;
  closingCredit: number;
}

interface PreviewVoucherItem {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
}

interface PreviewVoucher {
  voucherNo: string;
  date: string;
  description: string;
  items: PreviewVoucherItem[];
  totalDebit: number;
  totalCredit: number;
}

interface PreviewResult {
  type: "balance" | "journal" | "account";
  companyCode: string;
  year: number;
  rows: number;
  accounts: PreviewAccount[];
  balances?: PreviewBalance[];
  vouchers?: PreviewVoucher[];
  errors: string[];
  warnings: string[];
}

export default function ImportClient({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyCode, setCompanyCode] = useState("");
  const [importType, setImportType] = useState<"balance" | "journal" | "account">("balance");
  const [year, setYear] = useState("2026");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    fetch("/api/hr/companies")
      .then((r) => r.json())
      .then((data) => {
        const list = (data.companies || []) as Company[];
        setCompanies(list);
        if (list.length > 0) {
          setCompanyCode((prev) => prev || list[0].code);
        }
      })
      .catch(() => {});
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setPreview(null);
      setResult(null);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setPreview(null);
      setResult(null);
    }
  };

  async function handlePreview() {
    if (!file || !companyCode) return;
    setLoading(true);
    setPreview(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", importType);
    formData.append("companyCode", companyCode);
    formData.append("year", year);

    try {
      const res = await fetch("/api/finance/import/preview", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.preview);
      } else {
        setResult({ success: false, message: data.error || "预览失败" });
      }
    } catch {
      setResult({ success: false, message: "网络错误" });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setImporting(true);
    setResult(null);

    try {
      const res = await fetch("/api/finance/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview }),
      });
      const data = await res.json();
      if (data.success) {
        setResult({
          success: true,
          message: `导入成功：${data.imported} 条${preview.type === "balance" ? "余额" : preview.type === "account" ? "科目" : "凭证"}数据已写入`,
        });
        setPreview(null);
        setFile(null);
      } else {
        setResult({ success: false, message: data.error || "导入失败" });
      }
    } catch {
      setResult({ success: false, message: "网络错误" });
    } finally {
      setImporting(false);
    }
  }

  const typeLabel =
    importType === "balance" ? "余额表" :
    importType === "journal" ? "序时账" : "科目表";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Image
              src="/company/logo.png"
              alt={process.env.NEXT_PUBLIC_COMPANY_NAME || "公司"}
              width={100}
              height={30}
              className="h-auto w-auto max-w-[100px] object-contain"
            />
            <span className="text-sm text-gray-400">|</span>
            <span className="text-sm font-medium text-gray-700">财务数据导入</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/finance")}
              className="text-sm text-gray-500 hover:text-emerald-600"
            >
              返回财务
            </button>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Upload Card */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">上传文件</h2>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Company */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">公司</label>
              <select
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="">请选择公司</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code} {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">导入类型</label>
              <select
                value={importType}
                onChange={(e) => {
                  setImportType(e.target.value as "balance" | "journal" | "account");
                  setPreview(null);
                  setFile(null);
                  setResult(null);
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="balance">余额表</option>
                <option value="journal">序时账</option>
                <option value="account">科目表</option>
              </select>
            </div>

            {/* Year */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">年度</label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
              </select>
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
                    onChange={handleFileChange}
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

          <div className="flex items-center gap-3">
            <button
              onClick={handlePreview}
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

        {/* Result */}
        {result && (
          <div
            className={`mb-6 rounded-lg p-4 text-sm ${
              result.success
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {result.message}
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">
                  预览：{typeLabel}（{preview.year}年）
                </h3>
                <p className="text-sm text-gray-500">
                  共 {preview.rows} 行原始数据，解析出 {preview.accounts.length} 个科目
                  {preview.balances && `，${preview.balances.length} 条余额`}
                  {preview.vouchers && `，${preview.vouchers.length} 张凭证`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {preview.errors.length === 0 && (
                  <button
                    onClick={handleConfirm}
                    disabled={importing}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-gray-300"
                  >
                    {importing ? "导入中..." : "确认导入"}
                  </button>
                )}
              </div>
            </div>

            {/* Errors & Warnings */}
            {preview.errors.length > 0 && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                <p className="font-medium">错误（{preview.errors.length}）：</p>
                <ul className="mt-1 list-disc pl-5">
                  {preview.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.warnings.length > 0 && (
              <div className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-700">
                <p className="font-medium">警告（{preview.warnings.length}）：</p>
                <ul className="mt-1 list-disc pl-5">
                  {preview.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Accounts Table */}
            <div className="mb-4">
              <h4 className="mb-2 text-sm font-semibold text-gray-700">科目列表</h4>
              <div className="max-h-64 overflow-auto rounded-md border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">编码</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">名称</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">父级</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">类别</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">余额方向</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.accounts.map((acc) => (
                      <tr key={acc.code} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-700">{acc.code}</td>
                        <td className="px-3 py-2 text-gray-700">{acc.name}</td>
                        <td className="px-3 py-2 text-gray-500">{acc.parentCode || "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{acc.category}</td>
                        <td className="px-3 py-2 text-gray-500">{acc.balanceDirection}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Balance Preview */}
            {preview.balances && preview.balances.length > 0 && (
              <div className="mb-4">
                <h4 className="mb-2 text-sm font-semibold text-gray-700">余额预览（前20条）</h4>
                <div className="max-h-64 overflow-auto rounded-md border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">科目</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">期初借</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">期初贷</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">本期借</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">本期贷</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">期末借</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600">期末贷</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.balances.slice(0, 20).map((b) => (
                        <tr key={b.accountCode} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-700">
                            <span className="font-mono">{b.accountCode}</span> {b.accountName}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">{b.openingDebit.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{b.openingCredit.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{b.currentDebit.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{b.currentCredit.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{b.closingDebit.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{b.closingCredit.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.balances.length > 20 && (
                  <p className="mt-1 text-xs text-gray-400">还有 {preview.balances.length - 20} 条未显示</p>
                )}
              </div>
            )}

            {/* Voucher Preview */}
            {preview.vouchers && preview.vouchers.length > 0 && (
              <div className="mb-4">
                <h4 className="mb-2 text-sm font-semibold text-gray-700">凭证预览（前10张）</h4>
                <div className="max-h-96 overflow-auto space-y-3">
                  {preview.vouchers.slice(0, 10).map((v) => (
                    <div key={v.voucherNo} className="rounded-md border border-gray-200">
                      <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
                        <span className="font-medium text-gray-700">{v.voucherNo}</span>
                        <span className="text-xs text-gray-500">{v.date}</span>
                        <span className="text-xs text-gray-500">借 {v.totalDebit.toFixed(2)} / 贷 {v.totalCredit.toFixed(2)}</span>
                      </div>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-gray-100">
                          {v.items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-3 py-1.5 text-gray-600">{item.accountCode} {item.accountName}</td>
                              <td className="px-3 py-1.5 text-gray-500">{item.description}</td>
                              <td className="px-3 py-1.5 text-right text-gray-600">{item.debit > 0 ? item.debit.toFixed(2) : ""}</td>
                              <td className="px-3 py-1.5 text-right text-gray-600">{item.credit > 0 ? item.credit.toFixed(2) : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
                {preview.vouchers.length > 10 && (
                  <p className="mt-1 text-xs text-gray-400">还有 {preview.vouchers.length - 10} 张未显示</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
