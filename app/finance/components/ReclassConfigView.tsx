"use client";

import { useEffect, useState, useRef, useMemo } from "react";
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

      let all: RuleCandidate[] = [...s];
      if (accRes.ok) {
        const ad = await accRes.json();
        const accounts = (ad.data || ad.accounts || []) as { code: string; name: string; balanceDirection: string }[];
        const codeSet = new Set(s.map((c) => c.accountCode));
        for (const a of accounts) {
          if (!codeSet.has(a.code)) all.push({ accountCode: a.code, accountName: a.name, balanceDirection: a.balanceDirection, abnormalSide: "", abnormalAmount: 0, suggestedTarget: "", existingRuleId: null, existingTarget: null, existingSource: null, existingEnabled: null });
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
    if (scanned.length > 0) onStats?.({ total: allAccounts.length, noRule: scanned.filter((c) => !c.existingRuleId).length, hasRule: scanned.filter((c) => !!c.existingRuleId).length });
  }, [scanned, allAccounts.length, onStats]);

  async function saveRule(c: RuleCandidate, target: string) {
    const body = JSON.stringify({ companyCode, year: parseInt(year), sourceAccountCode: c.accountCode, abnormalSide: c.abnormalSide, targetAccountCode: target });
    const res = await fetch("/api/finance/reclass-rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body });
    if (!res.ok) { showToast("保存失败", "error"); return false; }
    const data = await res.json();
    updateCandidate(c.accountCode, data.rule.id, data.rule.targetAccountCode, data.rule.source, data.rule.enabled);
    return true;
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

  // ── Sort ─────────────────────────────────────────────

  type ConfigSortKey = "accountCode" | "amount";
  const [sortKey, setSortKey] = useState<ConfigSortKey>("amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const CONFIG_SORT: Record<string, ConfigSortKey> = {
    "科目编码": "accountCode",
    "金额": "amount",
  };

  function handleSort(label: string) {
    const key = CONFIG_SORT[label];
    if (!key) return;
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "amount" ? "desc" : "asc");
    }
  }

  // ── Filter & Sort ─────────────────────────────────────

  useEffect(() => { setPage(1); }, [keyword, statusFilter, sortKey, sortDir]);

  const filtered = useMemo(() => {
    const list = allAccounts.filter((c) => {
      if (statusFilter === "hasRule" && !c.existingRuleId) return false;
      if (statusFilter === "noRule" && c.existingRuleId) return false;
      if (keyword && !matchText(c.accountCode, keyword) && !matchText(c.accountName, keyword)) return false;
      return true;
    });
    const cmp = sortDir === "asc" ? 1 : -1;
    if (sortKey === "amount") {
      list.sort((a, b) => (a.abnormalAmount - b.abnormalAmount) * cmp);
    } else {
      list.sort((a, b) => a.accountCode.localeCompare(b.accountCode) * cmp);
    }
    return list;
  }, [allAccounts, statusFilter, keyword, sortKey, sortDir]);

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
              {RECLASS_HEADERS.map((h) => {
                const canSort = h in CONFIG_SORT;
                const active = CONFIG_SORT[h] === sortKey;
                return (
                  <th key={h}
                    className={`px-3 py-1.5 font-medium text-gray-500 ${h === "金额" ? "text-right" : "text-left"} ${canSort ? "cursor-pointer select-none hover:text-gray-700" : ""}`}
                    onClick={canSort ? () => handleSort(h) : undefined}>
                    {h}{active && <span className="text-gray-400">{sortDir === "asc" ? " ↑" : " ↓"}</span>}
                  </th>
                );
              })}
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
