"use client";

import { SelectField } from "@workspace/core/ui";
import type { QcTemplateMethodField, QcTemplateTestItem } from "@/server/services/production/qc";
import { QcPaperChoiceInput } from "./QcPaperInputs";
import { useQcFormulaEngine, type QcFieldValues } from "./useQcFormulaEngine";

interface Props {
  test: QcTemplateTestItem;
  compact?: boolean;
  values?: QcFieldValues;
  onFieldChange?: (key: string, value: string) => void;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: QcTemplateMethodField;
  value: string;
  onChange: (value: string) => void;
}) {
  const calculated = field.attr === "calculated" || !!field.formula || !!field.rule;
  if (field.type === "radio" || field.type === "checkbox") {
    return (
      <div className="flex min-h-9 items-center justify-center gap-2">
        <QcPaperChoiceInput
          fieldKey={field.fieldKey}
          options={field.options}
          type={field.type}
          disabled={calculated || field.attr === "prefilled"}
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
          disabled={calculated || field.attr === "prefilled"}
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
      <input
        data-field-key={field.fieldKey}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={calculated || field.attr === "prefilled"}
        inputMode={field.type === "number" ? "decimal" : "text"}
        className={`h-8 min-w-24 border-0 border-b border-slate-950 bg-transparent px-2 text-center text-sm outline-none ${calculated ? "text-slate-950" : ""}`}
      />
      {field.unit && <span className="text-xs text-slate-700">{field.unit}</span>}
    </div>
  );
}

export default function QcMethodFieldTable({ test, compact, values: controlledValues, onFieldChange }: Props) {
  const form = useQcFormulaEngine(test);
  const values = controlledValues || form.values;
  const setValue = onFieldChange || form.setValue;

  if (test.methodGroups.length === 0) {
    return <div className="border border-slate-950 px-4 py-6 text-sm text-slate-500">该方法暂未配置字段。</div>;
  }

  return (
    <div className="space-y-4">
      {test.methodGroups.map((group) => (
        <table key={group.name} className="w-full border-collapse text-sm text-slate-950">
          <tbody>
            <tr>
              <td colSpan={compact ? 3 : 4} className="border border-slate-950 px-3 py-2 font-semibold">{group.name}</td>
            </tr>
            {group.fields.map((field) => {
              const calculated = field.attr === "calculated" || !!field.formula;
              return (
                <tr key={`${group.name}-${field.fieldKey}`}>
                  <td className="w-[28%] border border-slate-950 px-3 py-2">{field.name}</td>
                  <td className="w-[28%] border border-slate-950 px-3 py-2">
                    <FieldInput
                      field={field}
                      value={values[field.fieldKey] ?? ""}
                      onChange={(value) => setValue(field.fieldKey, value)}
                    />
                  </td>
                  {!compact && <td className="w-[16%] border border-slate-950 px-3 py-2 text-center">{calculated ? "自动计算" : "填写"}</td>}
                  <td className="border border-slate-950 px-3 py-2 text-xs text-slate-600">
                    {field.formula ? `公式：${field.formula}` : field.rule ? `规则：${field.rule}` : field.attr === "prefilled" ? "预填" : " "}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
}
