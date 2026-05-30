"use client";

import { useState } from "react";
import AgentAvatar from "./AgentAvatar";

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

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl w-[380px] max-h-[80vh] overflow-auto mx-4">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-gradient-to-r from-violet-50 to-white">
          <AgentAvatar mood="confirm" size={32} />
          <div className="flex-1">
            <div className="text-sm font-semibold text-gray-800">确认变更</div>
            <div className="text-xs text-gray-500">请核对以下修改</div>
          </div>
        </div>

        {/* Diff */}
        <div className="px-4 py-4 space-y-3">
          <p className="text-sm text-gray-700">{summary}</p>

          <div className="rounded-lg border bg-gray-50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="px-3 py-2 font-medium text-gray-500 w-16">字段</th>
                  <th className="px-3 py-2 font-medium text-gray-500">原值</th>
                  <th className="px-3 py-2 font-medium text-gray-500">新值</th>
                </tr>
              </thead>
              <tbody>
                {"count" in proposal.diff ? (
                  // 批量更新 diff
                  <>
                    <tr className="border-t">
                      <td className="px-3 py-2 text-gray-600 font-medium">条件</td>
                      <td className="px-3 py-2 text-gray-700" colSpan={2}>
                        {String(proposal.diff.filterField)} {String(proposal.diff.filterOp)} &ldquo;{String(proposal.diff.filterValue)}&rdquo;
                      </td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-3 py-2 text-gray-600 font-medium">修改</td>
                      <td className="px-3 py-2 text-gray-700" colSpan={2}>
                        {String(proposal.diff.updateField)} → &ldquo;{String(proposal.diff.updateValue)}&rdquo;
                      </td>
                    </tr>
                    <tr className="border-t">
                      <td className="px-3 py-2 text-gray-600 font-medium">数量</td>
                      <td className="px-3 py-2 text-gray-700 font-bold" colSpan={2}>
                        {String(proposal.diff.count)} 名员工
                      </td>
                    </tr>
                  </>
                ) : (
                  // 单个更新 diff
                  <tr className="border-t">
                    <td className="px-3 py-2 text-gray-600 font-medium">{String(proposal.diff.field ?? "")}</td>
                    <td className="px-3 py-2 text-gray-400 line-through">{proposal.diff.oldValue == null ? "-" : String(proposal.diff.oldValue)}</td>
                    <td className="px-3 py-2 text-emerald-600 font-medium">{proposal.diff.newValue == null ? "-" : String(proposal.diff.newValue)}</td>
                  </tr>
                )}
                <tr className="border-t bg-gray-50">
                  <td className="px-3 py-2 text-gray-500">影响</td>
                  <td className="px-3 py-2 text-gray-500" colSpan={2}>
                    {proposal.targetType} {proposal.targetId || ""} · {proposal.actionKey}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 py-3 border-t bg-gray-50">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 rounded-lg bg-violet-500 px-4 py-2 text-sm text-white font-medium hover:bg-violet-600 disabled:opacity-50 transition"
          >
            {loading ? "执行中..." : "确认修改"}
          </button>
        </div>
      </div>
    </div>
  );
}
