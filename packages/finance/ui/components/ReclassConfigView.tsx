"use client";

import { workspacePath } from "@workspace/core/routing";
import { useCallback, useEffect, useState, useMemo } from "react";
import { createMessageSection, useFeedback } from "@workspace/core/ui";
import type { BodySurfaceSectionSpec, DataSurfaceColumnSpec, PageSurfaceFooterSpec } from "@workspace/core/ui";
import { matchText } from "@workspace/core/search";
import type { RuleCandidate } from "@workspace/finance/types";
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
  canRevise: boolean;
  onStats?: (s: {
    total: number;
    noRule: number;
    hasRule: number;
  }) => void;
}
export function useReclassConfigSection({
  companyCode,
  year,
  keyword = "",
  statusFilter = "hasRule",
  pageSize = 50,
  canRevise,
  onStats
}: Props): { section: BodySurfaceSectionSpec; footer?: PageSurfaceFooterSpec } {
  const [_scanned, setScanned] = useState<RuleCandidate[]>([]);
  const [allAccounts, setAllAccounts] = useState<RuleCandidate[]>([]);
  const { confirmDelete, error, success } = useFeedback();
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [editCode, setEditCode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // ── Fetch ───────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scanRes, accRes] = await Promise.all([fetch(workspacePath(`/api/modules/finance/ledger/reclass-rules?companyCode=${companyCode}&year=${year}`)), fetch(workspacePath(`/api/modules/finance/ledger/accounts?companyCode=${companyCode}&year=${year}&scope=all&pageSize=2000`))]);
      if (!scanRes.ok) {
        error("加载失败");
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
      error("网络错误");
    }
    setLoading(false);
  }, [companyCode, error, onStats, year]);
  useEffect(() => {
    load();
    setPage(1);
  }, [load]);

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
      error("请选择目标科目");
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
      error("保存失败");
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
      error("清除失败");
      return;
    }
    updateCandidate(c.accountCode, null, null, null, null);
    success("已清除规则");
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
      if (await saveRule(c, val)) success("已更新规则");
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
  const targetOptions = allAccounts.map((account) => ({
    value: account.accountCode,
    label: `${account.accountCode} ${account.accountName}`,
    searchText: account.accountName,
  }));
  const columns: DataSurfaceColumnSpec<RuleCandidate>[] = [{
    key: "accountCode",
    label: "科目编码",
    required: true,
    font: "mono",
    cell: candidate => candidate.accountCode
  }, {
    key: "accountName",
    label: "科目名称",
    required: true,
    cell: candidate => candidate.accountName
  }, {
    key: "side",
    label: "借贷",
    defaultVisible: true,
    align: "center",

    cell: candidate => candidate.abnormalSide
      ? dirBadge(candidate.abnormalSide)
      : { kind: "text", value: candidate.balanceDirection === "debit" ? "借" : candidate.balanceDirection === "credit" ? "贷" : "—", tone: "muted" }
  }, {
    key: "amount",
    label: "金额",
    defaultVisible: true,
    align: "right",
     font: "mono",
    cell: candidate => `¥${formatFinanceAmount(candidate.abnormalAmount)}`
  }, {
    key: "target",
    label: "建议科目",
    defaultVisible: true,
    cell: candidate => {
      const rowKey = candidate.accountCode + "::" + candidate.abnormalSide;
      const displayTarget = candidate.existingTarget || candidate.suggestedTarget;
      if (editCode === rowKey) {
        return {
          kind: "input",
          spec: { valueType: "string", control: "choice", options: { source: "static", items: targetOptions, visibleCount: 8 } },
          value: editValue,
          onChange: value => onEditValueChange(String(value ?? "")),
          onKeyDown: event => {
            if (event.key === "Escape") onCancelEdit();
            if (event.key === "Enter") void onCommitEdit(candidate);
          },
          placeholder: "输入科目编码搜索...",
          emptyText: "无匹配科目",
          density: "compact",
        };
      }
      return {
        kind: "action",
        action: {
          key: `target-${rowKey}`,
          label: displayTarget ? targetDisplay(displayTarget) : "选择科目",
          disabled: !canRevise,
          onClick: () => onStartEdit(candidate),
          size: "sm",
          presentation: "button",
        },
      };
    }
  }, {
    key: "actions",
    label: "操作",
    required: true,
    align: "center",
    cell: candidate => {
      if (!canRevise) return null;
      const actions = [];
      if (candidate.existingRuleId) {
        actions.push({
          key: "clear",
          label: "清除规则",
          icon: "reclass" as const,
          presentation: "glyph" as const,
          onClick: () => void clearRule(candidate),
          size: "sm" as const,
        });
      } else if (candidate.suggestedTarget) {
        actions.push({
          key: "confirm",
          label: "确认规则",
          icon: "reclass" as const,
          presentation: "glyph" as const,
          onClick: () => void saveRule(candidate, candidate.suggestedTarget).then(saved => {
            if (saved) success("已确认规则");
          }),
          size: "sm" as const,
        });
      } else {
        actions.push({
          key: "adjust",
          label: "调整规则",
          icon: "reclass" as const,
          presentation: "glyph" as const,
          onClick: () => startEdit(candidate),
          size: "sm" as const,
        });
      }
      return { kind: "actions" as const, align: "center" as const, actions };
    },
  }];
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
  if (loading) return { section: createMessageSection("reclass-candidates-loading", { tone: "muted", content: "扫描中..." }) };
  if (allAccounts.length === 0) return { section: createMessageSection("reclass-candidates-empty", { tone: "muted", content: "该年度无科目数据" }) };
  return {
    section: {
      key: "reclass-candidates",
      body: { kind: "data", data: {
            kind: "table",


            rows: paged,
            columns,
            visibleColumns: columns.map(column => column.key),
            rowKey: candidate => candidate.accountCode + "::" + candidate.abnormalSide,
                        presentation: { density: "compact" },

          } },
    },
    footer: { pagination: { page, totalPages, total: filtered.length, onPageChange: setPage } },
  };
}
