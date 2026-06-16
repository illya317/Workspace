"use client";

import type {
  QcTemplateEditorDraft,
  QcTemplateEditorFieldGroup,
  QcTemplateTestItem,
} from "@/server/services/production/qc";
import QcMethodFieldTable from "../QcMethodFieldTable";
import TemplateEditorFieldPanel from "./TemplateEditorFieldPanel";

interface Props {
  draft: QcTemplateEditorDraft;
  fieldGroups: QcTemplateEditorFieldGroup[];
  formulaFunctions: string[];
  onChange: (draft: QcTemplateEditorDraft) => void;
}

function formulaTestDraft(draft: QcTemplateEditorDraft): QcTemplateTestItem {
  return {
    sequence: draft.sequence || "",
    name: draft.testName || "模块公式试算",
    englishName: draft.testNameEn || draft.draftId,
    methodName: "模块公式试算",
    hasNumericConclusion: false,
    methodGroups: draft.methodDraft.methodGroups,
  };
}

export default function TemplateFormulaLabPanel({ draft, fieldGroups, formulaFunctions, onChange }: Props) {
  const calculatedFields = draft.methodDraft.methodGroups.flatMap((group) => group.fields.filter((field) => field.attr === "calculated" || !!field.formula || !!field.rule));
  const test = formulaTestDraft(draft);

  return (
    <aside className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">字段公式</h2>
          <p className="mt-1 text-xs text-slate-500">字段定义、下拉选项、默认值和计算公式在这里单独维护。</p>
        </div>
      </section>

      <TemplateEditorFieldPanel methodGroups={draft.methodDraft.methodGroups} fieldGroups={fieldGroups} formulaFunctions={formulaFunctions} onChange={(methodGroups) => onChange({ ...draft, methodDraft: { methodGroups } })} />

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">公式试算</h2>
            <p className="mt-1 text-xs text-slate-500">{calculatedFields.length} 个自动字段，可直接录入样例值查看结果。</p>
          </div>
        </div>
        <QcMethodFieldTable test={test} compact />
      </section>
    </aside>
  );
}
