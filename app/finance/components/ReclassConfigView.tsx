"use client";

import { useEffect, useState, useRef } from "react";
import Toast from "@/app/components/Toast";
import { useToast } from "@/app/hooks/useToast";
import { matchText } from "@/lib/search";
import Pagination from "./Pagination";
import type { RuleCandidate } from "@/server/services/finance/ledger/reclass-rules";
import { RECLASS_HEADERS } from "../ledger/reclassColumns";
import ReclassConfigRow from "./ReclassConfigRow";

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
  const [scanned, setScanned] = useState<RuleCandidate[]>([]);
  const [allAccounts, setAllAccounts] = useState<RuleCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const { toast, showToast, closeToast } = useToast();
  const [editCode, setEditCode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLDivElement>(null);

  // click outside → 退出编辑
  useEffect(() => {
    if (!editCode) return;
    function onDown(e: MouseEvent) {
      if (editRef.current && !editRef.current.contains(e.target as Node)) {
        setEditCode(null);
        setEditValue("");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [editCode]);

  // ── Fetch ───────────────────────────────────────────

  async function load() {
    setLoading(true);
    try {
      const [scanRes, accRes] = await Promise.all([
        fetch(`/api/finance/reclass-rules?companyCode=${companyCode}&year=${year}`),
        fetch(`/api/finance/accounts?companyCode=${companyCode}&year=${year}&scope=all&pageSize=2000`),
      ]);

      if (!scanRes.ok) { showToast("加载失败", "error"); return; }
      const scanData = await scanRes.json();
      const s: RuleCandidate[] = scanData.candidates || [];
      setScanned(s);

      // 全部科目（异常在最前面）
      let all: RuleCandidate[] = [...s];
      if (accRes.ok) {
        const ad = await accRes.json();
        const accounts: { code: string; name: string; balanceDirection: string }[] =
          ad.data || ad.accounts || [];
        const codeSet = new Set(s.map((c) => c.accountCode));
        for (const a of accounts) {
          if (!codeSet.has(a.code)) {
            all.push({
              accountCode: a.code, accountName: a.name,
              balanceDirection: a.balanceDirection,
              abnormalSide: "", abnormalAmount: 0, suggestedTarget: "",
              existingRuleId: null, existingTarget: null,
              existingSource: null, existingEnabled: null,
            });
          }
        }
      }
      setAllAccounts(all);

      onStats?.({
        total: all.length,
        noRule: s.filter((c) => !c.existingRuleId).length,
        hasRule: s.filter((c) => !!c.existingRuleId).length,
      });
    } catch { showToast("网络错误", "error"); }
    setLoading(false);
  }

  useEffect(() => { load(); setPage(1); }, [companyCode, year]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  // ── Actions ──────────────────────────────────────────

  function updateCandidate(code: string, id: number | null, target: string | null, source: string | null, enabled: boolean | null) {
    const fn = (prev: RuleCandidate[]) => prev.map((r) =>
      r.accountCode === code
        ? { ...r, existingRuleId: id, existingTarget: target, existingSource: source, existingEnabled: enabled }
        : r);
    setScanned(fn);
    setAllAccounts(fn);
  }

  // 规则变更后同步计数
  useEffect(() => {
    if (scanned.length > 0) {
      onStats?.({
        total: allAccounts.length,
        noRule: scanned.filter((c) => !c.existingRuleId).length,
        hasRule: scanned.filter((c) => !!c.existingRuleId).length,
      });
    }
  }, [scanned, allAccounts.length, onStats]);

  async function saveRule(c: RuleCandidate, target: string) {
    const res = await fetch("/api/finance/reclass-rules", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyCode, year: parseInt(year), sourceAccountCode: c.accountCode, abnormalSide: c.abnormalSide, targetAccountCode: target }),
    });
    if (!res.ok) { showToast("保存失败", "error"); return false; }
    const data = await res.json();
    updateCandidate(c.accountCode, data.rule.id, data.rule.targetAccountCode, data.rule.source, data.rule.enabled);
    return true;
  }

  async function clearRule(c: RuleCandidate) {
    if (!c.existingRuleId) return;
    if (!(await fetch(`/api/finance/reclass-rules/${c.existingRuleId}`, { method: "DELETE" })).ok) { showToast("清除失败", "error"); return; }
    updateCandidate(c.accountCode, null, null, null, null);
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


  // ── Filter ───────────────────────────────────────────

  useEffect(() => { setPage(1); }, [keyword, statusFilter]);

  // 选数据源：待配置/已确认用算法扫出的 scanned，全部用 allAccounts
  const source = statusFilter === "all" ? allAccounts : scanned;
  const filtered = source.filter((c) => {
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
  if (allAccounts.length === 0) return <p className="py-8 text-center text-sm text-gray-400">该年度无科目数据</p>;

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-xs">
          <thead className="border-b bg-gray-100">
            <tr>
              {RECLASS_HEADERS.map((h, i) => (
                <th key={h} className={`px-3 py-1.5 font-medium text-gray-500 ${i === 3 ? "text-right" : "text-left"}`}>{h}</th>
              ))}
              {canWrite && <th className="px-3 py-1.5 text-center font-medium text-gray-500">操作</th>}
            </tr>
          </thead>
          <tbody>
            {paged.map((c) => (
              <ReclassConfigRow
                key={c.accountCode + "::" + c.abnormalSide}
                c={c} canWrite={canWrite}
                companyCode={companyCode} year={year}
                editing={editCode === c.accountCode + "::" + c.abnormalSide}
                editValue={editValue} editRef={editRef}
                onStartEdit={startEdit}
                onCommitEdit={commitEdit}
                onSaveRule={async (c, t) => { if (await saveRule(c, t)) showToast("已确认规则"); }}
                onClearRule={clearRule}
                onEditValueChange={setEditValue}
                onCancelEdit={() => { setEditCode(null); setEditValue(""); }}
              />
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} />
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>
  );
}
