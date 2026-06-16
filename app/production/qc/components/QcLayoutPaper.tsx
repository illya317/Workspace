"use client";

import type { ReactNode } from "react";
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
  return <h3 className="mb-2 mt-5 text-[17px] font-semibold leading-7 text-slate-950">{block.displaySection ? `${block.displaySection} ` : ""}{block.title || fallback}</h3>;
}

function ProjectHeader({ block, context }: { block: QcLayoutBlock; context: LayoutRenderContext }) {
  const { test } = context;
  return (
    <TableBlock block={{ ...block, rows: [
      [{ rawText: `${test?.sequence || ""}  检测项目`, parts: [], colspan: 1, rowspan: 1, isEmpty: false, bold: true, align: "left" }, { rawText: test?.name || "项目名称", parts: [], colspan: 1, rowspan: 1, isEmpty: false, bold: true, align: "center" }, { rawText: "检验日期", parts: [], colspan: 1, rowspan: 1, isEmpty: false, align: "center" }, { rawText: "", parts: [{ type: "date", fieldKey: "layout/common/inspection_date" }], colspan: 1, rowspan: 1, isEmpty: false, align: "center" }],
      [{ rawText: "完成日期", parts: [], colspan: 1, rowspan: 1, isEmpty: false, align: "center" }, { rawText: "", parts: [{ type: "date", fieldKey: "layout/common/complete_date" }], colspan: 1, rowspan: 1, isEmpty: false, align: "center" }, { rawText: "判定日期", parts: [], colspan: 1, rowspan: 1, isEmpty: false, align: "center" }, { rawText: "", parts: [{ type: "date", fieldKey: "layout/common/judgment_date" }], colspan: 1, rowspan: 1, isEmpty: false, align: "center" }],
    ] }} context={context} />
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
      cell("", "15%", [{ type: "line", fieldKey: `${prefix}/temperature_${rowNo}`, width: "3.4rem", underline: true }, { type: "text", text: "℃" }]),
      cell("湿度", "10%"),
      cell("", "15%", [{ type: "line", fieldKey: `${prefix}/humidity_${rowNo}`, width: "3.4rem", underline: true }, { type: "text", text: "%" }]),
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
      cell("", [{ type: "line", fieldKey: `${prefix}/valid_until_${index + 1}`, width: "8rem" }]),
      cell("", [{ type: "radio", fieldKey: `${prefix}/confirmed_${index + 1}`, options: ["是", "否"] }]),
    ]),
  ] }} context={context} />;
}

function PostSection({ block, title, children }: { block: NumberedBlock; title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <Heading block={block} fallback={title} />
      <div className="text-[15px] leading-7 text-slate-950">{children}</div>
    </section>
  );
}

function RenderBlock({ block, context }: {
  block: NumberedBlock;
  context: LayoutRenderContext;
}) {
  const { test, values, onFieldChange } = context;
  if (block.type === "project_header") return <ProjectHeader block={block} context={context} />;
  if (block.type === "environment_table") return <EnvironmentTable block={block} context={context} />;
  if (block.type === "equipment_table") return <EquipmentTable block={block} context={context} />;
  if (block.type === "materials_table") return <QcConfirmationTable block={block} context={context} fallback="试验材料" items={block.materials || []} prefix={block.fieldPrefix || "layout/common/materials"} nameHeader="试验材料" />;
  if (block.type === "reference_standard_table") return <QcConfirmationTable block={block} context={context} fallback="标准品" items={block.standards || []} prefix={block.fieldPrefix || "layout/common/reference_standards"} nameHeader="标准品" />;
  if (block.type === "title") return <Heading block={block} fallback="操作方法" />;
  if (block.type === "operation_text") return <p className="mb-5 [text-indent:2em] text-[15px] leading-8 text-slate-950">{block.text}</p>;
  if (block.type === "paragraph") return <p className="mb-3 text-[15px] leading-8 text-slate-950">{block.parts?.map((part, index) => <Part key={index} part={part} context={context} />)}</p>;
  if (block.type === "standard_text") return <PostSection block={block} title="标准规定">{test?.standardText || "YAML 未配置标准规定"}</PostSection>;
  if (block.type === "attachment_upload") {
    const key = block.fieldKey || "layout/raw_data/attachments";
    return (
      <PostSection block={block} title="原始数据">
        <span>{block.text}</span>
        <button type="button" className="ml-4 rounded border border-slate-400 px-3 py-1 text-sm" onClick={() => onFieldChange(key, values[key] || "待上传")}>
          {block.buttonText || "上传"}
        </button>
        <input type="hidden" data-field-key={key} value={values[key] || ""} readOnly />
      </PostSection>
    );
  }
  if (block.type === "microbiology_cleanroom_exit") {
    const key = block.fieldKey || "layout/microbiology/cleanroom_exit_confirmed";
    return <PostSection block={block} title="清场"><span>{block.text}</span><span className="ml-8"><QcPaperChoiceInput fieldKey={key} value={values[key]} onChange={(value) => onFieldChange(key, value)} /></span></PostSection>;
  }
  if (block.type === "abnormal_handling") return <PostSection block={block} title="实验结果异常处理"><QcPaperChoiceInput fieldKey={`${block.fieldPrefix || "layout/abnormal"}/occurred`} value={values[`${block.fieldPrefix || "layout/abnormal"}/occurred`]} onChange={(value) => onFieldChange(`${block.fieldPrefix || "layout/abnormal"}/occurred`, value)} /> <span className="ml-8">实验室异常情况编号</span><QcPaperLineInput part={{ type: "line", fieldKey: `${block.fieldPrefix || "layout/abnormal"}/code`, width: "14rem" }} value={values[`${block.fieldPrefix || "layout/abnormal"}/code`]} onChange={(value) => onFieldChange(`${block.fieldPrefix || "layout/abnormal"}/code`, value)} /></PostSection>;
  if (block.type === "cleanup_checklist") return <PostSection block={block} title="清场">{(test?.cleanupItems?.length ? test.cleanupItems : block.items || ["YAML 未配置清场项目"]).map((item, index) => {
    const key = `${block.fieldPrefix || "layout/cleanup"}/item_${index + 1}`;
    return <div key={`${key}-${item}`} className="flex items-center justify-between border-b border-slate-950 py-1"><span>{item.replace(/[。.]?$/, "。")}</span><QcPaperChoiceInput fieldKey={key} value={values[key]} onChange={(value) => onFieldChange(key, value)} /></div>;
  })}</PostSection>;
  if (block.type === "conclusion") {
    const processKey = "layout/conclusion/process";
    const resultKey = test?.conclusionFieldKey || "layout/conclusion/result";
    const valueUnit = block.unit || (test?.standardText?.match(/%/) ? "%" : "");
    return <PostSection block={block} title="结论">批号<QcPaperLineInput part={{ type: "line", fieldKey: "batch_number", width: "8rem" }} value={values.batch_number} onChange={(value) => onFieldChange("batch_number", value)} />{test?.name || "本品"}（{block.conclusionName || test?.conclusionName || test?.name || "结论"}）检测过程<QcPaperSelectInput part={{ type: "select", fieldKey: processKey, underline: false }} options={["符合", "不符合"]} value={values[processKey]} onChange={(value) => onFieldChange(processKey, value)} />各项规定，结果{block.hasValue || test?.hasNumericConclusion ? <>为<Part part={{ type: "field", field: "结论-结果", readonlyDisplay: true }} context={context} />{valueUnit}，</> : null}<QcPaperSelectInput part={{ type: "select", fieldKey: resultKey, underline: false }} options={["符合", "不符合"]} value={values[resultKey]} onChange={(value) => onFieldChange(resultKey, value)} />标准规定。</PostSection>;
  }
  if (block.type === "table") return <TableBlock block={block} context={context} />;
  return block.text ? <p className="mb-3 text-[15px] leading-8 text-slate-950">{block.text}</p> : null;
}

export default function QcLayoutPaper({ blocks, compact: _compact, test, values: controlledValues, onFieldChange }: Props) {
  const engineTest = test || EMPTY_TEST;
  const form = useQcFormulaEngine(engineTest);
  const values = controlledValues || form.values;
  const setValue = onFieldChange || form.setValue;
  const numbered = numberBlocks(blocks, test?.sequence);
  const context: LayoutRenderContext = {
    test,
    values,
    onFieldChange: setValue,
    fieldByName: form.fieldByName,
    fieldByKey: form.fieldByKey,
    sectionAliases: numbered.sectionAliases,
  };
  const numberedBlocks = numbered.blocks;
  return (
    <div
      className="mx-auto w-[210mm] max-w-full overflow-visible"
      style={{ fontFamily: "\"FangSong\", \"STFangsong\", \"FangSong_GB2312\", \"仿宋\", serif" }}
    >
      {numberedBlocks.map((block, index) => <RenderBlock key={`${block.label || block.type}-${index}`} block={block} context={context} />)}
    </div>
  );
}
