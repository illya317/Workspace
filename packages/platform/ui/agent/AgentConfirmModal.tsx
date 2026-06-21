"use client";

import { useState } from "react";
import { ConfirmModal, DataTable, type DataTableColumn } from "@workspace/core/ui";

export interface ProposalInfo {
  id: number;
  actionKey: string;
  targetType: string;
  targetId?: string;
  diff: Record<string, unknown>;
}

interface Props {
  proposal: ProposalInfo;
  summary: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export default function AgentConfirmModal({ proposal, summary, onConfirm, onCancel }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setLoading(true);
    setError("");
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "执行失败");
      setLoading(false);
    }
  }

  const rows = "count" in proposal.diff
    ? [
        {
          field: "条件",
          oldValue: `${String(proposal.diff.filterField)} ${String(proposal.diff.filterOp)} “${String(proposal.diff.filterValue)}”`,
          newValue: "",
        },
        {
          field: "修改",
          oldValue: String(proposal.diff.updateField),
          newValue: String(proposal.diff.updateValue),
        },
        {
          field: "数量",
          oldValue: `${String(proposal.diff.count)} 名员工`,
          newValue: "",
        },
      ]
    : [
        {
          field: String(proposal.diff.field ?? ""),
          oldValue: proposal.diff.oldValue == null ? "-" : String(proposal.diff.oldValue),
          newValue: proposal.diff.newValue == null ? "-" : String(proposal.diff.newValue),
        },
      ];

  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: "field", label: "字段", required: true, render: (row) => row.field },
    { key: "oldValue", label: "原值", required: true, render: (row) => row.oldValue || "-" },
    { key: "newValue", label: "新值", required: true, render: (row) => row.newValue || "-" },
  ];

  return (
    <ConfirmModal
      open
      title="确认变更"
      message={(
        <div className="space-y-3">
          <p>{summary}</p>
          <DataTable
            rows={rows}
            columns={columns}
            visibleColumns={columns.map((column) => column.key)}
            density="compact"
            rowKey={(row) => row.field}
          />
          <p className="text-xs text-slate-500">
            影响：{proposal.targetType} {proposal.targetId || ""} · {proposal.actionKey}
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}
      confirmLabel="确认修改"
      confirmDanger={false}
      busy={loading}
      onConfirm={handleConfirm}
      onCancel={onCancel}
    />
  );
}
