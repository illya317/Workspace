"use client";

import { useEffect } from "react";
import type { QcLayoutPart } from "@workspace/production/server/qc";
import { qcRangeError, qcRangeLabel } from "../QcPaperInputs";
import { AdvancedFieldBadge } from "./badges";
import {
  durationValue,
  referenceFormulaText,
  resolveAdvancedFormulaText,
} from "./helpers";
import type { LayoutRenderContext } from "./types";

export function DurationPart({
  part,
  context,
  unit,
}: {
  part: QcLayoutPart;
  context: LayoutRenderContext;
  unit: "days" | "hours";
}) {
  const key = part.fieldKey || part.field || part.name || "";
  const sourceKey = key ? context.referenceSourceKeyFor?.(key) : undefined;
  const computed = durationValue(part, context.values, unit);
  const sourceValue = sourceKey ? context.values[sourceKey] : undefined;
  const value = sourceValue ?? (computed || context.values[key] || "");
  const error = qcRangeError(part, value);
  const hasReadonlyDependencies = !!(
    context.readonlyDisplayKeys?.has(part.startKey || "")
    || context.readonlyDisplayKeys?.has(part.endKey || "")
    || context.readonlyDisplayKeys?.has(part.startHourKey || "")
    || context.readonlyDisplayKeys?.has(part.endHourKey || "")
  );
  const isFirstDisplay = context.firstPartByKey?.get(key) === part;
  const isReferenceOutput = hasReadonlyDependencies && !isFirstDisplay;

  useEffect(() => {
    if (!sourceKey && key && computed && context.values[key] !== computed) context.onFieldChange(key, computed);
  }, [computed, context, key, sourceKey]);

  if (context.advancedMode) {
    return (
      <AdvancedFieldBadge
        label={sourceKey || isReferenceOutput ? "ref" : "f(x)"}
        kind={sourceKey || isReferenceOutput ? "reference" : "formulaOutput"}
        title={part.fieldKey || part.field || part.name}
        formulaText={sourceKey ? referenceFormulaText(sourceKey) : resolveAdvancedFormulaText(part, context.values)}
        fieldKey={key}
        anchorKey={key}
        active={!!key && context.activeAdvancedOutputKey === key}
        onToggle={context.onAdvancedOutputHover}
      />
    );
  }

  return (
    <span
      data-field-key={key}
      title={error}
      className={`mx-1 inline-block min-w-12 text-right tabular-nums align-baseline ${error ? "text-red-700" : ""} ${value ? "" : "text-slate-400"}`}
    >
      {value || part.placeholder || qcRangeLabel(part)}
    </span>
  );
}
