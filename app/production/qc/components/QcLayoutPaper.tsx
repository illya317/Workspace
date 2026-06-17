"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart, QcTemplateTestItem } from "@/server/services/production/qc";
import { QcPaperChoiceInput, QcPaperLineInput, QcPaperSelectInput } from "./QcPaperInputs";
import { Part, TableBlock, type LayoutRenderContext } from "./QcLayoutTable";
import QcConfirmationTable from "./QcConfirmationTable";
import { useQcFormulaEngine, type QcFieldValues } from "./useQcFormulaEngine";

interface Props {
  blocks: QcLayoutBlock[];
  compact?: boolean;
  test?: QcTemplateTestItem;
  values?: QcFieldValues;
  onFieldChange?: (key: string, value: string) => void;
  advancedMode?: boolean;
}

interface NumberedBlock extends QcLayoutBlock {
  displaySection?: string;
}

const EMPTY_TEST: QcTemplateTestItem = {
  sequence: "",
  name: "",
  englishName: "",
  methodName: "",
  hasNumericConclusion: false,
  methodGroups: [],
};

const BODY_TEXT_CLASS = "text-[15px] leading-8 text-slate-950 tabular-nums";
const HEADING_TEXT_CLASS = "text-[17px] font-semibold leading-7 text-slate-950";

function todayValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function offsetDateValue(offsetDays?: number) {
  if (offsetDays == null || !Number.isFinite(offsetDays)) return undefined;
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function collectDateDefaults(blocks: QcLayoutBlock[]) {
  const defaults = new Map<string, string>();
  const addPart = (part: QcLayoutPart) => {
    if (part.type !== "date") return;
    const key = part.fieldKey || part.field || part.name || "";
    const value = part.defaultValue || offsetDateValue(part.defaultOffsetDays) || todayValue();
    if (key && value && !defaults.has(key)) defaults.set(key, value);
  };

  for (const block of blocks) {
    block.parts?.forEach(addPart);
    block.rows?.forEach((row) => row.forEach((cell: QcLayoutCell) => cell.parts.forEach(addPart)));
  }

  return defaults;
}

function collectReadonlyDisplayKeys(blocks: QcLayoutBlock[]) {
  const keys = new Set<string>();
  const visitPart = (part: QcLayoutPart) => {
    if (!part.readonlyDisplay) return;
    const key = part.fieldKey || part.field || part.name || "";
    if (key) keys.add(key);
  };
  for (const block of blocks) {
    block.parts?.forEach(visitPart);
    block.rows?.forEach((row) => row.forEach((cell: QcLayoutCell) => cell.parts.forEach(visitPart)));
  }
  return keys;
}

function collectFirstPartByKey(blocks: QcLayoutBlock[]) {
  const first = new Map<string, QcLayoutPart>();
  const visitPart = (part: QcLayoutPart) => {
    const key = part.fieldKey || part.field || part.name || "";
    if (!key || first.has(key)) return;
    first.set(key, part);
  };
  for (const block of blocks) {
    block.parts?.forEach(visitPart);
    block.rows?.forEach((row) => row.forEach((cell: QcLayoutCell) => cell.parts.forEach(visitPart)));
  }
  return first;
}

function scopePrefix(fieldKey: string) {
  const parts = fieldKey.split("/");
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}/` : `${fieldKey}/`;
}

function collectFormulaInputKeys(test?: QcTemplateTestItem) {
  const dependencyMap = collectFormulaDependencies(test);
  return new Set(Array.from(dependencyMap.values()).flatMap((keys) => Array.from(keys)));
}

function collectAdvancedFormulaInputKeys(blocks: QcLayoutBlock[]) {
  const keys = new Set<string>();
  const visitPart = (part: QcLayoutPart) => {
    for (const key of part.advancedDependencyFieldKeys || []) keys.add(key);
    for (const value of Object.values(part.advancedDependencyFieldKeyMap || {})) {
      for (const key of value) keys.add(key);
    }
  };
  for (const block of blocks) {
    block.parts?.forEach(visitPart);
    block.rows?.forEach((row) => row.forEach((cell) => cell.parts.forEach(visitPart)));
  }
  return keys;
}

function collectFormulaDependencies(test?: QcTemplateTestItem) {
  const dependencies = new Map<string, Set<string>>();
  if (!test) return dependencies;
  const fields = test.methodGroups.flatMap((group) => group.fields);
  const calculated = fields.filter((field) => field.attr === "calculated" && (field.formula || field.rule));
  for (const field of calculated) {
    const expr = String(field.formula || field.rule || "");
    const prefix = scopePrefix(field.fieldKey);
    const related = new Set<string>();
    for (const candidate of fields) {
      if (candidate.fieldKey === field.fieldKey) continue;
      if (!candidate.fieldKey.startsWith(prefix)) continue;
      if (!expr.includes(candidate.name)) continue;
      related.add(candidate.fieldKey);
    }
    dependencies.set(field.fieldKey, related);
  }
  return dependencies;
}

function collectAdvancedPartMetadata(blocks: QcLayoutBlock[]) {
  const metadata = new Map<string, QcLayoutPart>();
  const visitPart = (part: QcLayoutPart) => {
    const key = part.fieldKey || part.field || part.name || "";
    if (!key) return;
    if (
      part.advancedFormulaText
      || part.advancedFormulaTextMap
      || part.advancedDependencyFieldKeys?.length
      || part.advancedDependencyFieldKeyMap
      || part.type === "duration_days"
      || part.type === "duration_hours"
    ) {
      metadata.set(key, part);
    }
  };
  for (const block of blocks) {
    block.parts?.forEach(visitPart);
    block.rows?.forEach((row) => row.forEach((cell) => cell.parts.forEach(visitPart)));
  }
  return metadata;
}

function joinSectionSuffix(base?: string, suffix?: string) {
  if (!base) return suffix || "";
  if (!suffix || suffix === "auto") return base;
  return `${base}.${suffix}`;
}

function isNumericSection(suffix?: string): suffix is string {
  return !!suffix && /^\d+(?:\.\d+)*$/.test(suffix);
}

function numberBlocks(blocks: QcLayoutBlock[], sequence?: string): { blocks: NumberedBlock[]; sectionAliases: Record<string, string> } {
  let nextTopLevel = 1;
  const sectionAliases: Record<string, string> = {};
  return { sectionAliases, blocks: blocks.map((block) => {
    const suffix = block.sectionSuffix;
    const role = block.sectionRole;
    let displaySection: string | undefined;
    if (block.sectionRef) {
      const nestedSuffix = joinSectionSuffix(sectionAliases[block.sectionRef], suffix);
      displaySection = nestedSuffix ? sequence ? `${sequence}.${nestedSuffix}` : nestedSuffix : undefined;
      if (nestedSuffix && role && (block.sectionAnchor || block.sectionSlot)) sectionAliases[role] = nestedSuffix;
    } else if (isNumericSection(suffix)) {
      displaySection = sequence ? `${sequence}.${suffix}` : suffix;
      const topLevel = Number(suffix.split(".")[0]);
      if (Number.isFinite(topLevel)) nextTopLevel = Math.max(nextTopLevel, topLevel + 1);
      if (role) sectionAliases[role] = suffix;
    } else if (block.sectionSlot || suffix === "auto" || block.sectionAnchor) {
      const alias = String(nextTopLevel++);
      if (role) sectionAliases[role] = alias;
      displaySection = sequence ? `${sequence}.${alias}` : alias;
    }
    return { ...block, displaySection };
  }) };
}

function Heading({ block, fallback }: { block: NumberedBlock; fallback: string }) {
  const title = block.title || fallback;
  const section = block.displaySection || "";
  return (
    <h3
      className={`mb-2 mt-5 w-fit ${HEADING_TEXT_CLASS}`}
      data-inline-feedback="true"
      data-inline-feedback-kind="heading"
      data-inline-feedback-key={section ? `heading:${section}` : `heading:${title}`}
      data-inline-feedback-label={title}
      data-inline-feedback-section={section || undefined}
    >
      {section ? `${section} ` : ""}
      {title}
    </h3>
  );
}

function EnvironmentTable({ block, context }: { block: NumberedBlock; context: LayoutRenderContext }) {
  const prefix = block.fieldPrefix || "layout/environment";
  const rowCount = block.roomRows || 1;
  const cell = (rawText: string, width: string, parts: QcLayoutPart[] = []): QcLayoutCell => ({
    rawText,
    parts,
    colspan: 1,
    rowspan: 1,
    isEmpty: false,
    align: "center",
    width,
  });
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const rowNo = index + 1;
    return [
      cell("房间名称", "12%"),
      cell("", "13%", [{ type: "line", fieldKey: `${prefix}/room_name_${rowNo}`, width: "6.5rem" }]),
      cell("房间编号", "12%"),
      cell("", "13%", [{ type: "line", fieldKey: `${prefix}/room_no_${rowNo}`, width: "6.5rem" }]),
      cell("温度", "10%"),
      cell("", "15%", [{ type: "line", fieldKey: `${prefix}/temperature_${rowNo}`, width: "3.4rem" }, { type: "text", text: "℃" }]),
      cell("湿度", "10%"),
      cell("", "15%", [{ type: "line", fieldKey: `${prefix}/humidity_${rowNo}`, width: "3.4rem" }, { type: "text", text: "%" }]),
    ];
  });
  return <TableBlock block={{ ...block, rows: [
    [{ rawText: `${block.displaySection ? `${block.displaySection} ` : ""}${block.title || "实验环境"}：温度：${block.temperatureRange || "10℃～30℃"}，湿度${block.humidityLimit || "≤75%"}`, parts: [], colspan: 8, rowspan: 1, isEmpty: false, bold: true, align: "left" }],
    ...rows,
  ] }} context={context} />;
}

function EquipmentTable({ block, context }: {
  block: NumberedBlock;
  context: LayoutRenderContext;
}) {
  const prefix = block.fieldPrefix || "layout/equipment";
  const cell = (rawText: string, parts: QcLayoutPart[] = []): QcLayoutCell => ({
    rawText,
    parts,
    colspan: 1,
    rowspan: 1,
    isEmpty: false,
    align: "center",
  });
  const statusText = (status?: string) => (status || "已清洁").replace(/^["“]+|["”]+$/g, "");
  const devices = block.devices?.length ? block.devices : [{ name: "仪器、设备", status: "已清洁" }];
  return <TableBlock block={{ ...block, rows: [
    [{ rawText: `${block.displaySection ? `${block.displaySection} ` : ""}${block.title || "仪器、设备"}`, parts: [], colspan: 5, rowspan: 1, isEmpty: false, bold: true, align: "left" }],
    ["仪器、设备", "设备编号", "设备状态", "校验有效期至", "是否确认"].map((text) => cell(text)),
    ...devices.map((device, index) => [
      cell(device.name),
      cell("", [{ type: "line", fieldKey: `${prefix}/device_no_${index + 1}`, width: "8rem" }]),
      cell(statusText(device.status)),
      cell("", [{ type: "date", fieldKey: `${prefix}/valid_until_${index + 1}` }]),
      cell("", [{ type: "radio", fieldKey: `${prefix}/confirmed_${index + 1}`, options: ["是", "否"] }]),
    ]),
  ] }} context={context} />;
}

function PostSection({ block, title, children }: { block: NumberedBlock; title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <Heading block={block} fallback={title} />
      <div className={BODY_TEXT_CLASS}>{children}</div>
    </section>
  );
}

function RenderBlock({ block, context }: {
  block: NumberedBlock;
  context: LayoutRenderContext;
}) {
  const { test, values, onFieldChange, advancedMode } = context;
  if (block.type === "environment_table") return <EnvironmentTable block={block} context={context} />;
  if (block.type === "equipment_table") return <EquipmentTable block={block} context={context} />;
  if (block.type === "materials_table") return <QcConfirmationTable block={block} context={context} fallback="试验材料" items={block.materials || []} prefix={block.fieldPrefix || "layout/common/materials"} nameHeader="试验材料" />;
  if (block.type === "reference_standard_table") return <QcConfirmationTable block={block} context={context} fallback="标准品" items={block.standards || []} prefix={block.fieldPrefix || "layout/common/reference_standards"} nameHeader="标准品" />;
  if (block.type === "title") return <Heading block={block} fallback="操作方法" />;
  if (block.type === "operation_text") return <p className={`mb-5 [text-indent:2em] ${BODY_TEXT_CLASS}`}>{block.text}</p>;
  if (block.type === "paragraph") return <p className={`mb-3 ${BODY_TEXT_CLASS}`}>{block.parts?.map((part, index) => <Part key={index} part={part} context={context} />)}</p>;
  if (block.type === "standard_text") return <PostSection block={block} title="标准规定">{test?.standardText || "YAML 未配置标准规定"}</PostSection>;
  if (block.type === "attachment_upload") {
    const key = block.fieldKey || "layout/raw_data/attachments";
    return (
      <PostSection block={block} title="原始数据">
        <span>{block.text}</span>
        {advancedMode ? (
          <Part part={{ type: "line", fieldKey: key, underline: true }} context={context} />
        ) : (
          <>
            <button type="button" className="ml-4 rounded border border-slate-400 px-3 py-1 text-sm" onClick={() => onFieldChange(key, values[key] || "待上传")}>
              {block.buttonText || "上传"}
            </button>
            <input type="hidden" data-field-key={key} value={values[key] || ""} readOnly />
          </>
        )}
      </PostSection>
    );
  }
  if (block.type === "microbiology_cleanroom_exit") {
    const key = block.fieldKey || "layout/microbiology/cleanroom_exit_confirmed";
    return <PostSection block={block} title="清场"><span>{block.text}</span><span className="ml-8">{advancedMode ? <Part part={{ type: "radio", fieldKey: key, options: ["是", "否"] }} context={context} /> : <QcPaperChoiceInput fieldKey={key} value={values[key]} onChange={(value) => onFieldChange(key, value)} />}</span></PostSection>;
  }
  if (block.type === "abnormal_handling") return <PostSection block={block} title="实验结果异常处理">{advancedMode ? <Part part={{ type: "radio", fieldKey: `${block.fieldPrefix || "layout/abnormal"}/occurred`, options: ["是", "否"] }} context={context} /> : <QcPaperChoiceInput fieldKey={`${block.fieldPrefix || "layout/abnormal"}/occurred`} value={values[`${block.fieldPrefix || "layout/abnormal"}/occurred`]} onChange={(value) => onFieldChange(`${block.fieldPrefix || "layout/abnormal"}/occurred`, value)} />} <span className="ml-8">实验室异常情况编号</span>{advancedMode ? <Part part={{ type: "line", fieldKey: `${block.fieldPrefix || "layout/abnormal"}/code`, width: "14rem", underline: true }} context={context} /> : <QcPaperLineInput part={{ type: "line", fieldKey: `${block.fieldPrefix || "layout/abnormal"}/code`, width: "14rem" }} value={values[`${block.fieldPrefix || "layout/abnormal"}/code`]} onChange={(value) => onFieldChange(`${block.fieldPrefix || "layout/abnormal"}/code`, value)} />}</PostSection>;
  if (block.type === "cleanup_checklist") return <PostSection block={block} title="清场">{(test?.cleanupItems?.length ? test.cleanupItems : block.items || ["YAML 未配置清场项目"]).map((item, index) => {
    const key = `${block.fieldPrefix || "layout/cleanup"}/item_${index + 1}`;
    return (
      <div key={`${key}-${item}`} className="flex items-center gap-6 border-b border-slate-950 py-1">
        <span className="min-w-0 flex-1">{item.replace(/[。.]?$/, "。")}</span>
        <span className="inline-flex w-44 justify-center">
          {advancedMode ? <Part part={{ type: "radio", fieldKey: key, options: ["是", "否"] }} context={context} /> : <QcPaperChoiceInput fieldKey={key} value={values[key]} onChange={(value) => onFieldChange(key, value)} />}
        </span>
      </div>
    );
  })}</PostSection>;
  if (block.type === "conclusion") {
    const processKey = "layout/conclusion/process";
    const resultKey = test?.conclusionFieldKey || "layout/conclusion/result";
    const valueUnit = block.unit || (test?.standardText?.match(/%/) ? "%" : "");
    return (
      <PostSection block={block} title="结论">
        <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1 gap-y-0 whitespace-normal">
          <span>批号</span>
          <Part part={{ type: "line", fieldKey: "batch_number", underline: true, width: "6rem" }} context={context} />
          <span>{test?.name || "本品"}（{block.conclusionName || test?.conclusionName || test?.name || "结论"}）检测过程</span>
          <Part part={{ type: "select", fieldKey: processKey, underline: true, options: ["符合", "不符合"] }} context={context} />
          <span>各项规定，结果</span>
          {block.hasValue || test?.hasNumericConclusion ? (
            <>
              <span>为</span>
              <Part part={{ type: "field", field: "结论-结果", readonlyDisplay: true, underline: true }} context={context} />
              {valueUnit ? <span>{valueUnit}</span> : null}
              <span>，</span>
            </>
          ) : null}
          <Part part={{ type: "select", fieldKey: resultKey, underline: true, options: ["符合", "不符合"] }} context={context} />
          <span>标准规定。</span>
        </span>
      </PostSection>
    );
  }
  if (block.type === "table") return <TableBlock block={block} context={context} />;
  return block.text ? <p className={`mb-3 ${BODY_TEXT_CLASS}`}>{block.text}</p> : null;
}

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
  const advancedPartMetadata = useMemo(() => collectAdvancedPartMetadata(blocks), [blocks]);

  useEffect(() => {
    for (const [key, value] of dateDefaults) {
      if (!values[key]) setValue(key, value);
    }
  }, [dateDefaults, setValue, values]);

  const numbered = numberBlocks(blocks, test?.sequence);
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
  };
  const numberedBlocks = numbered.blocks;
  return (
    <div
      className="mx-auto w-[210mm] max-w-full overflow-visible tabular-nums"
      style={{ fontFamily: "\"FangSong\", \"STFangsong\", \"FangSong_GB2312\", \"仿宋\", serif" }}
    >
      {numberedBlocks.map((block, index) => <RenderBlock key={`${block.label || block.type}-${index}`} block={block} context={context} />)}
    </div>
  );
}
