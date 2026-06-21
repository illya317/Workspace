"use client";

import { useEffect } from "react";
import type { QcLayoutPart } from "@workspace/production/server/qc";
import { QcPaperLineInput } from "./QcPaperInputs";
import type { LayoutRenderContext } from "./qc-layout-table/types";
import type { QcFieldValues } from "./useQcFormulaEngine";

function parsePlateCount(value?: string) {
  const text = String(value || "").trim().replace(/,/g, "");
  if (!text) return null;
  const num = Number(text);
  if (Number.isFinite(num)) return num;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function formatPlateAverage(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10000) / 10000);
}

function dilutionSegment(value?: string) {
  const normalized = String(value || "").replace(/\s/g, "");
  if (normalized === "1:10") return "1_10";
  if (normalized === "1:100") return "1_100";
  if (normalized === "1:1000") return "1_1000";
  return "";
}

function microbialSelectedTotalValue(part: QcLayoutPart, values: QcFieldValues) {
  const key = part.fieldKey || part.field || part.name || "";
  const prefix = key.replace(/\/selected_total_count$/, "");
  if (!prefix || prefix === key) return "";
  const dilution = dilutionSegment(values[`${prefix}/selected_count_source`]);
  if (!dilution) return "";
  const lastDay = part.summaryDay || (prefix.includes("/mold_yeast/") ? 7 : 5);
  const a = parsePlateCount(values[`${prefix}/${dilution}_a_day${lastDay}`]);
  const b = parsePlateCount(values[`${prefix}/${dilution}_b_day${lastDay}`]);
  return a == null || b == null ? "" : formatPlateAverage((a + b) / 2);
}

export function MicrobialSelectedTotalPart({ part, context }: { part: QcLayoutPart; context: LayoutRenderContext }) {
  const key = part.fieldKey || part.field || part.name || "";
  const computed = microbialSelectedTotalValue(part, context.values);
  useEffect(() => {
    if (key && context.values[key] !== computed) context.onFieldChange(key, computed);
  }, [computed, context, key]);
  return (
    <QcPaperLineInput
      part={{ ...part, fieldKey: key }}
      readOnly
      value={computed}
      onChange={(value) => context.onFieldChange(key, value)}
    />
  );
}
