"use client";

import { createPageBody, createPageDataSection, type DataSurfaceStructuredCellSpec, InputControl, PageSurface } from "@workspace/core/ui";
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
        <InputControl
          spec={{
            valueType: "string",
            control: "choice",
            state: readOnly || calculated || field.attr === "prefilled" ? "disabled" : "normal",
            options: {
              source: "static",
              mode: "dropdown",
              items: (field.options ?? []).map((option) => ({ value: option, label: option })),
            },
          }}
          ariaLabel={field.name || field.fieldKey || "选择项"}
          dataFieldKey={field.fieldKey}
          value={value}
          onChange={(next) => onChange(String(next ?? ""))}
          placeholder=" "
          textAlign="center"
        />
        {field.unit && <span className="text-xs text-slate-700">{field.unit}</span>}
      </div>
    );
  }
  return (
    <div className="flex min-h-9 items-center justify-center gap-2">
      <InputControl
        spec={{ valueType: field.type === "number" ? "number" : "string", control: "text" }}
        dataFieldKey={field.fieldKey}
        value={value}
        onChange={(next) => onChange(String(next ?? ""))}
        readOnly={readOnly || calculated || field.attr === "prefilled"}
        inputMode={field.type === "number" ? "decimal" : "text"}
        textAlign="center"
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
    return <PageSurface kind="standard" embedded body={createPageBody([], { empty: { content: "该方法暂未配置字段。", compact: true,  } })} />;
  }

  return (
    <div className="space-y-4">
      {test.methodGroups.map((group) => {
        const rows: DataSurfaceStructuredCellSpec[][] = [
          [{ content: group.name, colSpan: compact ? 3 : 4, emphasis: "strong", }],
          ...group.fields.map((field): DataSurfaceStructuredCellSpec[] => {
            const calculated = field.attr === "calculated" || !!field.formula;
            const helpText = field.formula ? `公式：${field.formula}` : field.rule ? `规则：${field.rule}` : field.attr === "prefilled" ? "预填" : " ";
            return [
              { content: field.name,  },
              {
                content: (
                  <FieldInput
                    field={field}
                    value={values[field.fieldKey] ?? ""}
                    readOnly={readOnly}
                    onChange={(value) => setValue(field.fieldKey, value)}
                  />
                ),

              },
              ...(!compact ? [{ content: calculated ? "自动计算" : "填写", align: "center" as const }] : []),
              { content: helpText,  },
            ];
          }),
        ];
        return (
          <PageSurface kind="standard"
            key={group.name}
            embedded
            body={createPageBody([
              createPageDataSection(`qc-method-field-${group.name}`, {
                kind: "structured",
                wrap: false,
                structuredScroll: false,
                rows,

              }),
            ])}
          />
        );
      })}
    </div>
  );
}
