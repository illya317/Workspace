"use client";

import { useEffect, useMemo, useState } from "react";
import type { QcLayoutBlock, QcTemplateTestItem } from "@workspace/production/server/qc";
import type { LayoutRenderContext } from "./qc-layout-table/types";
import { useQcFormulaEngine, type QcFieldValues } from "./useQcFormulaEngine";
import { RenderBlock } from "./qc-layout-paper/blocks";
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
  onFieldChange?: (key: string, value: string) => void;
  advancedMode?: boolean;
}

const EMPTY_TEST: QcTemplateTestItem = {
  sequence: "",
  name: "",
  englishName: "",
  methodName: "",
  hasNumericConclusion: false,
  methodGroups: [],
};

export default function QcLayoutPaper({ blocks, compact: _compact, test, values: controlledValues, onFieldChange, advancedMode = false }: Props) {
  const engineTest = test || EMPTY_TEST;
  const form = useQcFormulaEngine(engineTest);
  const values = controlledValues || form.values;
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
    packagingReference
      ? (fieldKey: string) => referenceSourceKey(packagingReference, test, fieldKey)
      : undefined
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
    advancedMode,
    activeAdvancedOutputKey,
    onAdvancedOutputHover: setActiveAdvancedOutputKey,
    referenceSourceKeyFor,
  };

  return (
    <div
      className="mx-auto w-[210mm] max-w-full overflow-visible tabular-nums"
      style={{ fontFamily: "\"FangSong\", \"STFangsong\", \"FangSong_GB2312\", \"仿宋\", serif" }}
    >
      {numbered.blocks.map((block, index) => <RenderBlock key={`${block.label || block.type}-${index}`} block={block} context={context} />)}
    </div>
  );
}
