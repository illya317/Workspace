"use client";

import type { RuleCandidate } from "@/server/services/finance/ledger/reclass-rules";
import AccountCodeInput from "./AccountCodeInput";
import { targetDisplay } from "../ledger/reclassColumns";

interface Props {
  c: RuleCandidate;
  canWrite: boolean;
  companyCode: string;
  year: string;
  editing: boolean;
  editValue: string;
  editRef: React.RefObject<HTMLDivElement | null>;
  onStartEdit: (c: RuleCandidate) => void;
  onCommitEdit: (c: RuleCandidate) => void;
  onSaveRule: (c: RuleCandidate, target: string) => void;
  onClearRule: (c: RuleCandidate) => void;
  onEditValueChange: (v: string) => void;
  onCancelEdit: () => void;
}

export default function ReclassConfigRow({
  c, canWrite, companyCode, year, editing, editValue, editRef,
  onStartEdit, onCommitEdit, onSaveRule, onClearRule, onEditValueChange, onCancelEdit,
}: Props) {
  const hasRule = !!c.existingRuleId;
  const key = c.accountCode + "::" + c.abnormalSide;

  return (
    <tr key={key} className="border-b last:border-0">
      <td className="px-3 py-1.5 font-mono text-gray-600">{c.accountCode}</td>
      <td className="px-3 py-1.5 text-gray-700">{c.accountName}</td>
      <td className="px-3 py-1.5 text-center">
        {c.abnormalSide
          ? <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-red-50 text-red-700">{c.abnormalSide === "debit" ? "借" : "贷"}</span>
          : <span className="text-gray-400">{c.balanceDirection === "debit" ? "借" : c.balanceDirection === "credit" ? "贷" : "—"}</span>
        }
      </td>
      <td className="px-3 py-1.5 text-right font-mono text-gray-700">
        ¥{c.abnormalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
      </td>
      <td
        className="px-3 py-1.5 cursor-pointer hover:bg-gray-50"
        onClick={() => { if (!editing && canWrite) onStartEdit(c); }}
      >
        {editing ? (
          <div ref={editRef} onKeyDown={(e) => {
            if (e.key === "Escape") onCancelEdit();
            if (e.key === "Enter") onCommitEdit(c);
          }}>
            <AccountCodeInput
              companyCode={companyCode} year={year}
              value={editValue}
              onChange={onEditValueChange}
            />
          </div>
        ) : hasRule ? (
          <span className="inline-block rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-mono text-emerald-700 cursor-pointer hover:ring-1 hover:ring-emerald-300">{targetDisplay(c.existingTarget!)}</span>
        ) : c.suggestedTarget ? (
          <span className="inline-block rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-mono text-gray-500 cursor-pointer hover:ring-1 hover:ring-emerald-300">{targetDisplay(c.suggestedTarget)}</span>
        ) : (
          <span className="inline-block rounded border border-dashed border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-400 cursor-pointer hover:border-emerald-300 hover:text-emerald-600">选择科目</span>
        )}
      </td>
      {canWrite && (
        <td className="px-3 py-1.5 text-center">
          {hasRule ? (
            <button onClick={() => onClearRule(c)} className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100">清除规则</button>
          ) : c.suggestedTarget ? (
            <button onClick={() => onSaveRule(c, c.suggestedTarget)} className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100">确认</button>
          ) : (
            <button onClick={() => onStartEdit(c)} className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100">调整</button>
          )}
        </td>
      )}
    </tr>
  );
}
