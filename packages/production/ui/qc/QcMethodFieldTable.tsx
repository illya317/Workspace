"use client";

import { EmptyStateCard, SelectField, StructuredTable, TextField, type StructuredTableCell } from "@workspace/core/ui";
import type { QcTemplateMethodField, QcTemplateTestItem } from "@workspace/production/server/qc";
import { QcPaperChoiceInput } from "./QcPaperInputs";
import { useQcFormulaEngine, type QcFieldValues } from "./useQcFormulaEngine";

interface Props {
  test: QcTemplateTestItem;
  compact?: boolean;
  values?: QcFieldValues;
  onFieldChange?: (key: string, value: string) => void;
  readOnly?: boolean;
}

function FieldInput({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: QcTemplateMethodField;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  const calculated = field.attr === "calculated" || !!field.formula || !!field.rule;
  if (field.type === "radio" || field.type === "checkbox") {
    return (
      <div className="flex min-h-9 items-center justify-center gap-2">
        <QcPaperChoiceInput
          fieldKey={field.fieldKey}
          options={field.options}
          type={field.type}
          disabled={readOnly || calculated || field.attr === "prefilled"}
          value={value}
          onChange={onChange}
        />
        {field.unit && <span className="text-xs text-slate-700">{field.unit}</span>}
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <div className="flex min-h-9 items-center justify-center gap-2">
        <SelectField
          ariaLabel={field.name || field.fieldKey || "选择项"}
          dataFieldKey={field.fieldKey}
          value={value}
          onChange={onChange}
          disabled={readOnly || calculated || field.attr === "prefilled"}
          placeholder=" "
          options={(field.options ?? []).map((option) => ({ value: option, label: option }))}
          className="inline-block min-w-16"
          selectClassName="h-8 min-h-8 rounded-none border-0 border-b border-slate-950 bg-transparent px-1 text-center text-sm shadow-none disabled:opacity-100"
        />
        {field.unit && <span className="text-xs text-slate-700">{field.unit}</span>}
      </div>
    );
  }
  return (
    <div className="flex min-h-9 items-center justify-center gap-2">
      <TextField
        dataFieldKey={field.fieldKey}
        value={value}
        onChange={onChange}
        readOnly={readOnly || calculated || field.attr === "prefilled"}
        inputMode={field.type === "number" ? "decimal" : "text"}
        unstyled
        className={`h-8 min-w-24 border-0 border-b border-slate-950 bg-transparent px-2 text-center text-sm outline-none ${calculated ? "text-slate-950" : ""}`}
      />
      {field.unit && <span className="text-xs text-slate-700">{field.unit}</span>}
    </div>
  );
}

export default function QcMethodFieldTable({ test, compact, values: controlledValues, onFieldChange, readOnly = false }: Props) {
  const form = useQcFormulaEngine(test);
  const values = controlledValues || form.values;
  const setValue = onFieldChange || form.setValue;

  if (test.methodGroups.length === 0) {
    return <EmptyStateCard compact className="border-slate-950 text-slate-500">该方法暂未配置字段。</EmptyStateCard>;
  }

  return (
    <div className="space-y-4">
      {test.methodGroups.map((group) => {
        const rows: StructuredTableCell[][] = [
          [{ content: group.name, colSpan: compact ? 3 : 4, className: "border border-slate-950 px-3 py-2 font-semibold" }],
          ...group.fields.map((field): StructuredTableCell[] => {
            const calculated = field.attr === "calculated" || !!field.formula;
            const helpText = field.formula ? `公式：${field.formula}` : field.rule ? `规则：${field.rule}` : field.attr === "prefilled" ? "预填" : " ";
            return [
              { content: field.name, className: "w-[28%] border border-slate-950 px-3 py-2" },
              {
                content: (
                  <FieldInput
                    field={field}
                    value={values[field.fieldKey] ?? ""}
                    readOnly={readOnly}
                    onChange={(value) => setValue(field.fieldKey, value)}
                  />
                ),
                className: "w-[28%] border border-slate-950 px-3 py-2",
              },
              ...(!compact ? [{ content: calculated ? "自动计算" : "填写", className: "w-[16%] border border-slate-950 px-3 py-2 text-center" }] : []),
              { content: helpText, className: "border border-slate-950 px-3 py-2 text-xs text-slate-600" },
            ];
          }),
        ];
        return (
          <StructuredTable
            key={group.name}
            rows={rows}
            className="w-full border-collapse text-sm text-slate-950"
          />
        );
      })}
    </div>
  );
}
