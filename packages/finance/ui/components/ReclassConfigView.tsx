"use client";

import { workspacePath } from "@workspace/core/routing";
import { useEffect, useState, useRef, useMemo } from "react";
import { CommandButton, DataTable, PanelCard, Toast, useConfirmDelete } from "@workspace/core/ui";
import type { DataTableColumn } from "@workspace/core/ui";
import { useToast } from "@workspace/core/hooks";
import { matchText } from "@workspace/core/search";
import type { RuleCandidate } from "@workspace/finance/types";
import { Pagination } from "@workspace/core/ui";
import AccountCodeInput from "./AccountCodeInput";
import { formatFinanceAmount } from "../formatters";
import { dirBadge, targetDisplay } from "../ledger/reclassColumns";
function deriveAbnormalSide(bd: string) {
  return bd === "debit" ? "credit" : "debit";
}
function suggestTarget(c: string) {
  return c.startsWith("1") ? "2241" : c.startsWith("2") ? "1463" : "";
}
interface Props {
  companyCode: string;
  year: string;
  keyword?: string;
  statusFilter?: "all" | "noRule" | "hasRule";
  pageSize?: number;
  canWrite: boolean;
  onStats?: (s: {
    total: number;
    noRule: number;
    hasRule: number;
  }) => void;
}
export default function ReclassCandidateList({
  companyCode,
  year,
  keyword = "",
  statusFilter = "hasRule",
  pageSize = 50,
  canWrite,
  onStats
}: Props) {
  const [_scanned, setScanned] = useState<RuleCandidate[]>([]);
  const [allAccounts, setAllAccounts] = useState<RuleCandidate[]>([]);
  const confirmDelete = useConfirmDelete();
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const {
    toast,
    showToast,
    closeToast
  } = useToast();
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
      const [scanRes, accRes] = await Promise.all([fetch(workspacePath(`/api/modules/finance/ledger/reclass-rules?companyCode=${companyCode}&year=${year}`)), fetch(workspacePath(`/api/modules/finance/ledger/accounts?companyCode=${companyCode}&year=${year}&scope=all&pageSize=2000`))]);
      if (!scanRes.ok) {
        showToast("加载失败", "error");
        return;
      }
      const scanData = await scanRes.json();
      const s: RuleCandidate[] = scanData.candidates || [];
      setScanned(s);
      const all: RuleCandidate[] = [...s];
      if (accRes.ok) {
        const ad = await accRes.json();
        const accounts = (ad.data || ad.accounts || []) as {
          code: string;
          name: string;
          balanceDirection: string;
        }[];
        const codeSet = new Set(s.map(c => c.accountCode));
        for (const a of accounts) {
          if (!codeSet.has(a.code)) all.push({
            accountCode: a.code,
            accountName: a.name,
            balanceDirection: a.balanceDirection,
            abnormalSide: deriveAbnormalSide(a.balanceDirection),
            abnormalAmount: 0,
            suggestedTarget: suggestTarget(a.code),
            existingRuleId: null,
            existingTarget: null,
            existingSource: null,
            existingEnabled: null
          });
        }
      }
      setAllAccounts(all);
      const noRuleCount = all.filter(c => c.abnormalSide && !c.existingRuleId).length;
      onStats?.({
        total: all.length,
        noRule: noRuleCount,
        hasRule: all.length - noRuleCount
      });
    } catch {
      showToast("网络错误", "error");
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyCode, year]);

  // ── Actions ──────────────────────────────────────────

  function updateCandidate(code: string, id: number | null, target: string | null, source: string | null, enabled: boolean | null) {
    const fn = (prev: RuleCandidate[]) => prev.map(r => r.accountCode === code ? {
      ...r,
      existingRuleId: id,
      existingTarget: target,
      existingSource: source,
      existingEnabled: enabled
    } : r);
    setScanned(fn);
    setAllAccounts(fn);
  }

  // 规则变更后同步计数（from allAccounts）
  useEffect(() => {
    if (allAccounts.length > 0) {
      const noRule = allAccounts.filter(c => c.abnormalSide && !c.existingRuleId).length;
      onStats?.({
        total: allAccounts.length,
        noRule,
        hasRule: allAccounts.length - noRule
      });
    }
  }, [allAccounts, onStats]);
  async function saveRule(c: RuleCandidate, target: string) {
    if (!target.trim()) {
      showToast("请选择目标科目", "error");
      return false;
    }
    const body = JSON.stringify({
      companyCode,
      year: parseInt(year),
      sourceAccountCode: c.accountCode,
      abnormalSide: c.abnormalSide,
      targetAccountCode: target
    });
    const res = await fetch(workspacePath("/api/modules/finance/ledger/reclass-rules"), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body
    });
    if (!res.ok) {
      showToast("保存失败", "error");
      return false;
    }
    const data = await res.json();
    updateCandidate(c.accountCode, data.rule.id, data.rule.targetAccountCode, data.rule.source, data.rule.enabled);
    return true;
  }
  async function clearRule(c: RuleCandidate) {
    if (!c.existingRuleId) return;
    const ok = await confirmDelete({
      title: "清除规则",
      message: `确定清除科目 ${c.accountCode} 的重分类规则吗？`,
      confirmLabel: "清除"
    });
    if (!ok) return;
    if (!(await fetch(workspacePath(`/api/modules/finance/ledger/reclass-rules/${c.existingRuleId}`), {
      method: "DELETE"
    })).ok) {
      showToast("清除失败", "error");
      return;
    }
    updateCandidate(c.accountCode, null, null, null, null);
    showToast("已清除规则");
  }
  function startEdit(c: RuleCandidate) {
    setEditCode(c.accountCode + "::" + c.abnormalSide);
    setEditValue(c.existingTarget || c.suggestedTarget);
  }
  async function commitEdit(c: RuleCandidate) {
    const val = editValue.trim();
    setEditCode(null);
    setEditValue("");
    if (val && val !== (c.existingTarget || "")) {
      if (await saveRule(c, val)) showToast("已更新规则");
    }
  }

  // ── Sort ─────────────────────────────────────────────

  const sortKey = "amount" as "accountCode" | "amount";
  const sortDir = "desc" as "asc" | "desc";

  // ── Filter & Sort ─────────────────────────────────────

  useEffect(() => {
    setPage(1);
  }, [keyword, statusFilter, sortKey, sortDir]);
  const filtered = useMemo(() => {
    const list = allAccounts.filter(c => {
      if (statusFilter === "noRule" && (c.existingRuleId || !c.abnormalSide)) return false;
      if (statusFilter === "hasRule" && !c.existingRuleId && c.abnormalSide) return false;
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
  const columns: DataTableColumn<RuleCandidate>[] = [{
    key: "accountCode",
    label: "科目编码",
    required: true,
    cellClassName: "font-mono text-slate-600",
    render: candidate => candidate.accountCode
  }, {
    key: "accountName",
    label: "科目名称",
    required: true,
    render: candidate => candidate.accountName
  }, {
    key: "side",
    label: "借贷",
    defaultVisible: true,
    headerClassName: "text-center",
    cellClassName: "text-center",
    render: candidate => candidate.abnormalSide ? dirBadge(candidate.abnormalSide) : <span className="text-slate-400">{candidate.balanceDirection === "debit" ? "借" : candidate.balanceDirection === "credit" ? "贷" : "—"}</span>
  }, {
    key: "amount",
    label: "金额",
    defaultVisible: true,
    headerClassName: "text-right",
    cellClassName: "text-right font-mono text-slate-700",
    render: candidate => `¥${formatFinanceAmount(candidate.abnormalAmount)}`
  }, {
    key: "target",
    label: "建议科目",
    defaultVisible: true,
    render: candidate => {
      const rowKey = candidate.accountCode + "::" + candidate.abnormalSide;
      const hasRule = !!candidate.existingRuleId;
      const displayTarget = candidate.existingTarget || candidate.suggestedTarget;
      const targetClassName = hasRule ? "inline-block cursor-pointer rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs text-emerald-700 hover:ring-1 hover:ring-emerald-300" : displayTarget ? "inline-block cursor-pointer rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-500 hover:ring-1 hover:ring-emerald-300" : "inline-block cursor-pointer rounded border border-dashed border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-400 hover:border-emerald-300 hover:text-emerald-600";
      return <div className="cursor-pointer" onClick={event => {
        event.stopPropagation();
        if (!editCode && canWrite) onStartEdit(candidate);
      }}>
            {editCode === rowKey ? <div ref={editRef} onKeyDown={event => {
          if (event.key === "Escape") onCancelEdit();
          if (event.key === "Enter") void onCommitEdit(candidate);
        }}>
                <AccountCodeInput companyCode={companyCode} year={year} value={editValue} onChange={onEditValueChange} />
              </div> : displayTarget ? <span className={targetClassName}>{targetDisplay(displayTarget)}</span> : <span className={targetClassName}>选择科目</span>}
          </div>;
    }
  }, ...(canWrite ? [{
    key: "actions",
    label: "操作",
    defaultVisible: true,
    headerClassName: "text-center",
    cellClassName: "text-center",
    render: (candidate: RuleCandidate) => {
      if (candidate.existingRuleId) {
        return <CommandButton onClick={event => {
          event.stopPropagation();
          void clearRule(candidate);
        }} size="sm" className="px-2 py-1 text-xs">
              清除规则
            </CommandButton>;
      }
      if (candidate.suggestedTarget) {
        return <CommandButton onClick={event => {
          event.stopPropagation();
          void saveRule(candidate, candidate.suggestedTarget).then(saved => {
            if (saved) showToast("已确认规则");
          });
        }} size="sm" className="px-2 py-1 text-xs">
              确认
            </CommandButton>;
      }
      return <CommandButton onClick={event => {
        event.stopPropagation();
        startEdit(candidate);
      }} size="sm" className="px-2 py-1 text-xs">
            调整
          </CommandButton>;
    }
  } satisfies DataTableColumn<RuleCandidate>] : [])];
  function onStartEdit(candidate: RuleCandidate) {
    startEdit(candidate);
  }
  function onCancelEdit() {
    setEditCode(null);
    setEditValue("");
  }
  function onEditValueChange(nextValue: string) {
    setEditValue(nextValue);
  }
  async function onCommitEdit(candidate: RuleCandidate) {
    await commitEdit(candidate);
  }

  // ── Render ───────────────────────────────────────────
  if (loading) return <p className="py-8 text-center text-sm text-gray-400">扫描中...</p>;
  if (allAccounts.length === 0) return <p className="py-8 text-center text-sm text-gray-400">该年度无科目数据</p>;
  return <div>
      <PanelCard className="overflow-hidden" bodyClassName="overflow-x-auto">
        <DataTable rows={paged} columns={columns} visibleColumns={columns.map(column => column.key)} rowKey={candidate => candidate.accountCode + "::" + candidate.abnormalSide} density="compact" />
      </PanelCard>
      <Pagination page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} />
      <Toast message={toast?.message || ""} type={toast?.type} show={!!toast} onClose={closeToast} />
    </div>;
}
