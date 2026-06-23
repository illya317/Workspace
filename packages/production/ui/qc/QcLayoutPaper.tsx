"use client";

import { useEffect, useMemo, useState } from "react";
import type { QcLayoutBlock, QcTemplateTestItem } from "@workspace/production/server/qc";
import type { LayoutRenderContext } from "./qc-layout-table/types";
import { useQcFormulaEngine, type QcFieldValues } from "./useQcFormulaEngine";
import { RenderAttachmentPages, RenderBlock } from "./qc-layout-paper/blocks";
import {
  collectAdvancedFormulaInputKeys,
  collectAdvancedPartMetadata,
  collectDateDefaults,
  collectFirstPartByKey,
  collectFormulaDependencies,
  collectFormulaInputKeys,
  collectReadonlyDisplayKeys,
  numberBlocks,
  referenceSourceKey,
  reusedPackagingSource,
} from "./qc-layout-paper/helpers";

interface Props {
  blocks: QcLayoutBlock[];
  compact?: boolean;
  test?: QcTemplateTestItem;
  values?: QcFieldValues;
  referenceValues?: QcFieldValues;
  onFieldChange?: (key: string, value: string) => void;
  readOnly?: boolean;
  advancedMode?: boolean;
  fieldScopePrefix?: string;
}

const EMPTY_TEST: QcTemplateTestItem = {
  sequence: "",
  name: "",
  englishName: "",
  methodName: "",
  hasNumericConclusion: false,
  methodGroups: [],
};

function fixedReferenceSourceKey(fieldKey: string) {
  if (fieldKey === "batch_number") return "__qc_ref/batch_number";
  if (fieldKey.endsWith("/signature/inspector")) return "__qc_ref/inspector";
  if (fieldKey.endsWith("/signature/reviewer")) return "__qc_ref/reviewer";
  return undefined;
}

export default function QcLayoutPaper({ blocks, compact: _compact, test, values: controlledValues, referenceValues, onFieldChange, readOnly = false, advancedMode = false, fieldScopePrefix }: Props) {
  const engineTest = test || EMPTY_TEST;
  const form = useQcFormulaEngine(engineTest);
  const inputValues = controlledValues || form.values;
  const values = useMemo(() => ({ ...(referenceValues || {}), ...inputValues }), [inputValues, referenceValues]);
  const setValue = onFieldChange || form.setValue;
  const [activeAdvancedOutputKey, setActiveAdvancedOutputKey] = useState<string | null>(null);
  const dateDefaults = useMemo(() => collectDateDefaults(blocks), [blocks]);
  const readonlyDisplayKeys = useMemo(() => collectReadonlyDisplayKeys(blocks), [blocks]);
  const firstPartByKey = useMemo(() => collectFirstPartByKey(blocks), [blocks]);
  const formulaInputKeys = useMemo(() => {
    const keys = collectFormulaInputKeys(test);
    for (const key of collectAdvancedFormulaInputKeys(blocks)) keys.add(key);
    return keys;
  }, [blocks, test]);
  const formulaDependencies = useMemo(() => collectFormulaDependencies(test), [test]);
  const advancedPartMetadata = useMemo(() => collectAdvancedPartMetadata(blocks, test), [blocks, test]);
  const packagingReference = useMemo(() => reusedPackagingSource(test), [test]);
  const referenceSourceKeyFor = useMemo(() => (
    (fieldKey: string) => fixedReferenceSourceKey(fieldKey) || (
      packagingReference ? referenceSourceKey(packagingReference, test, fieldKey) : undefined
    )
  ), [packagingReference, test]);

  useEffect(() => {
    for (const [key, value] of dateDefaults) {
      if (referenceSourceKeyFor?.(key)) continue;
      if (!values[key]) setValue(key, value);
    }
  }, [dateDefaults, referenceSourceKeyFor, setValue, values]);

  const numbered = useMemo(() => numberBlocks(blocks, test?.sequence), [blocks, test?.sequence]);
  const context: LayoutRenderContext = {
    test,
    values,
    onFieldChange: setValue,
    fieldByName: form.fieldByName,
    fieldByKey: form.fieldByKey,
    readonlyDisplayKeys,
    firstPartByKey,
    formulaInputKeys,
    formulaDependencies,
    advancedPartMetadata,
    sectionAliases: numbered.sectionAliases,
    readOnly,
    advancedMode,
    activeAdvancedOutputKey,
    onAdvancedOutputHover: setActiveAdvancedOutputKey,
    referenceSourceKeyFor,
    fieldScopePrefix,
  };

  return (
    <div
      className="qc-a4-page mx-auto box-border w-[210mm] min-w-[210mm] overflow-visible bg-white px-[16mm] py-[15mm] text-slate-950 shadow-[0_0_0_1px_rgba(15,23,42,0.10),0_10px_35px_rgba(15,23,42,0.12)] tabular-nums"
      style={{ fontFamily: "\"FangSong\", \"STFangsong\", \"FangSong_GB2312\", \"仿宋\", serif" }}
    >
      {numbered.blocks.map((block, index) => <RenderBlock key={`${block.label || block.type}-${index}`} block={block} context={context} />)}
      <RenderAttachmentPages blocks={numbered.blocks} context={context} />
    </div>
  );
}
