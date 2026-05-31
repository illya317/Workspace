"use client";

import { useEffect, useState } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import { matchText } from "@/lib/search";
import Pagination from "./Pagination";
import type { RuleCandidate } from "@/server/services/finance/ledger/reclass-rules";
import AccountCodeInput from "./AccountCodeInput";

interface Props {
  companyCode: string; year: string;
  keyword?: string; statusFilter?: "all" | "noRule" | "hasRule";
  pageSize?: number;
  canWrite: boolean;
  onStats?: (s: { total: number; noRule: number; hasRule: number }) => void;
}

export default function ReclassCandidateList({
  companyCode, year, keyword = "", statusFilter = "noRule", pageSize = 50, canWrite, onStats,
}: Props) {
  const [candidates, setCandidates] = useState<RuleCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const { toast, showToast, closeToast } = useToast();
  const [editCode, setEditCode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // ── Fetch ───────────────────────────────────────────

  async function load() {
    setLoading(true);
    try {
      const [scanRes, allRes] = await Promise.all([
        fetch(`/api/finance/reclass-rules?companyCode=${companyCode}&year=${year}`),
        statusFilter === "all"
          ? fetch(`/api/finance/accounts?companyCode=${companyCode}&year=${year}&scope=all&pageSize=2000`)
          : null,
      ]);

      if (!scanRes.ok) { showToast("加载失败", "error"); return; }
      const scanData = await scanRes.json();
      const scanned: RuleCandidate[] = scanData.candidates || [];

      let all: RuleCandidate[] = scanned;
      if (allRes?.ok) {
        const allData = await allRes.json();
        const allAccounts: { code: string; name: string; balanceDirection: string }[] =
          allData.data || allData.accounts || [];
        const scannedCodes = new Set(scanned.map((c) => c.accountCode));
        for (const a of allAccounts) {
          if (!scannedCodes.has(a.code)) {
            all.push({
              accountCode: a.code, accountName: a.name,
              balanceDirection: a.balanceDirection,
              abnormalSide: "",
              abnormalAmount: 0,
              suggestedTarget: "",
              existingRuleId: null, existingTarget: null,
              existingSource: null, existingEnabled: null,
            });
          }
        }
      }

      setCandidates(all);
      onStats?.({
        total: all.length,
        noRule: scanned.filter((c) => !c.existingRuleId).length,
        hasRule: scanned.filter((c) => !!c.existingRuleId).length,
      });
    } catch { showToast("网络错误", "error"); }
    setLoading(false);
  }

  useEffect(() => { load(); setPage(1); }, [companyCode, year, statusFilter]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // ── Actions ──────────────────────────────────────────

  async function saveRule(c: RuleCandidate, target: string) {
    const res = await fetch("/api/finance/reclass-rules", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyCode, year: parseInt(year), sourceAccountCode: c.accountCode, abnormalSide: c.abnormalSide, targetAccountCode: target }),
    });
    if (!res.ok) { showToast("保存失败", "error"); return false; }
    const data = await res.json();
    setCandidates((prev) => prev.map((r) =>
      r.accountCode === c.accountCode && r.abnormalSide === c.abnormalSide
        ? { ...r, existingRuleId: data.rule.id, existingTarget: data.rule.targetAccountCode, existingSource: data.rule.source, existingEnabled: data.rule.enabled }
        : r));
    return true;
  }

  async function clearRule(c: RuleCandidate) {
    if (!c.existingRuleId) return;
    if (!(await fetch(`/api/finance/reclass-rules/${c.existingRuleId}`, { method: "DELETE" })).ok) { showToast("清除失败", "error"); return; }
    setCandidates((prev) => prev.map((r) =>
      r.accountCode === c.accountCode && r.abnormalSide === c.abnormalSide
        ? { ...r, existingRuleId: null, existingTarget: null, existingSource: null, existingEnabled: null }
        : r));
    showToast("已清除规则");
  }

  function startEdit(c: RuleCandidate) {
    setEditCode(c.accountCode + "::" + c.abnormalSide);
    setEditValue(c.existingTarget || c.suggestedTarget);
  }

  async function commitEdit(c: RuleCandidate) {
    const val = editValue.trim();
    setEditCode(null); setEditValue("");
    if (val && val !== (c.existingTarget || "")) { if (await saveRule(c, val)) showToast("已更新规则"); }
  }

  // ── Render helpers ───────────────────────────────────

  const dirBadge = (dir: string) =>
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${dir === "debit" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
      {dir === "debit" ? "借" : "贷"}</span>;

  const TARGET_NAMES: Record<string, string> = { "2241": "其他应付款", "1463": "其他流动资产" };
  const targetDisplay = (code: string) => TARGET_NAMES[code] ? `${code}/${TARGET_NAMES[code]}` : code;

  // ── Filter ───────────────────────────────────────────

  useEffect(() => { setPage(1); }, [keyword, statusFilter]);

  const filtered = candidates.filter((c) => {
    if (statusFilter === "hasRule" && !c.existingRuleId) return false;
    if (statusFilter === "noRule" && c.existingRuleId) return false;
    if (keyword && !matchText(c.accountCode, keyword) && !matchText(c.accountName, keyword)) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const skip = (page - 1) * pageSize;
  const paged = filtered.slice(skip, skip + pageSize);

  // ── Render ───────────────────────────────────────────

  if (loading) return <p className="py-8 text-center text-sm text-gray-400">扫描中...</p>;
  if (candidates.length === 0) return <p className="py-8 text-center text-sm text-gray-400">该年度无异常方向科目（仅扫描资产/负债类 1xxx、2xxx 科目）</p>;

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="border-b bg-gray-100">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium text-gray-500">科目编码</th>
              <th className="px-3 py-1.5 text-left font-medium text-gray-500">科目名称</th>
              <th className="px-3 py-1.5 text-left font-medium text-gray-500">异常方向</th>
              <th className="px-3 py-1.5 text-right font-medium text-gray-500">异常金额</th>
              <th className="px-3 py-1.5 text-left font-medium text-gray-500">建议目标</th>
              <th className="px-3 py-1.5 text-left font-medium text-gray-500">当前目标</th>
              {canWrite && <th className="px-3 py-1.5 text-left font-medium text-gray-500">操作</th>}
            </tr>
          </thead>
          <tbody>
            {paged.map((c) => {
              const key = c.accountCode + "::" + c.abnormalSide;
              const editing = editCode === key;
              const hasRule = !!c.existingRuleId;
              return (
                <tr key={key} className="border-b last:border-0">
                  <td className="px-3 py-1.5 font-mono text-gray-600">{c.accountCode}</td>
                  <td className="px-3 py-1.5 text-gray-700">{c.accountName}</td>
                  <td className="px-3 py-1.5">{dirBadge(c.abnormalSide)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-700">¥{c.abnormalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-1.5 text-gray-500">{c.suggestedTarget ? targetDisplay(c.suggestedTarget) : "—"}</td>
                  <td className="px-3 py-1.5">
                    {editing ? (
                      <div onKeyDown={(e) => { if (e.key === "Escape") { setEditCode(null); setEditValue(""); } if (e.key === "Enter") commitEdit(c); }}>
                        <AccountCodeInput companyCode={companyCode} year={year} value={editValue} onChange={setEditValue} />
                      </div>
                    ) : hasRule ? <span className="text-emerald-700">{targetDisplay(c.existingTarget!)}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  {canWrite && (
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        {!hasRule && c.suggestedTarget && (
                          <button onClick={() => saveRule(c, c.suggestedTarget).then(ok => ok && showToast("已确认规则"))} className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100">确认建议</button>
                        )}
                        <button onClick={() => startEdit(c)} className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-100">
                          {hasRule ? "编辑" : "手动配置"}</button>
                        {hasRule && <button onClick={() => clearRule(c)} className="rounded px-1.5 py-0.5 text-xs text-red-500 hover:bg-red-50">清除</button>}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} />
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
