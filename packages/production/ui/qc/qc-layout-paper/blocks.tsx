"use client";

import type { ReactNode } from "react";
import { ActionButton, HiddenDataField } from "@workspace/core/ui";
import type { QcLayoutCell, QcLayoutPart } from "@workspace/production/server/qc";
import QcConfirmationTable from "../QcConfirmationTable";
import { Part, TableBlock } from "../QcLayoutTable";
import { QcPaperChoiceInput, QcPaperLineInput } from "../QcPaperInputs";
import type { LayoutRenderContext } from "../qc-layout-table/types";
import type { NumberedBlock } from "./helpers";

const BODY_TEXT_CLASS = "text-[15px] leading-8 text-slate-950 tabular-nums";
const HEADING_TEXT_CLASS = "text-[17px] font-semibold leading-7 text-slate-950";

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
      {section ? `${section} ` : ""}{title}
    </h3>
  );
}

function EnvironmentTable({ block, context }: { block: NumberedBlock; context: LayoutRenderContext }) {
  const prefix = block.fieldPrefix || "layout/environment";
  const cell = (rawText: string, width: string, parts: QcLayoutPart[] = []): QcLayoutCell => ({ rawText, parts, colspan: 1, rowspan: 1, isEmpty: false, align: "center", width });
  const rows = Array.from({ length: block.roomRows || 1 }, (_, index) => {
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

function EquipmentTable({ block, context }: { block: NumberedBlock; context: LayoutRenderContext }) {
  const prefix = block.fieldPrefix || "layout/equipment";
  const cell = (rawText: string, parts: QcLayoutPart[] = []): QcLayoutCell => ({ rawText, parts, colspan: 1, rowspan: 1, isEmpty: false, align: "center" });
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
  return <section className="mb-4"><Heading block={block} fallback={title} /><div className={BODY_TEXT_CLASS}>{children}</div></section>;
}

export function RenderBlock({ block, context }: { block: NumberedBlock; context: LayoutRenderContext }) {
  const { test } = context;
  if (block.type === "environment_table") return <EnvironmentTable block={block} context={context} />;
  if (block.type === "equipment_table") return <EquipmentTable block={block} context={context} />;
  if (block.type === "materials_table") return <QcConfirmationTable block={block} context={context} fallback="试验材料" items={block.materials || []} prefix={block.fieldPrefix || "layout/common/materials"} nameHeader="试验材料" />;
  if (block.type === "reference_standard_table") return <QcConfirmationTable block={block} context={context} fallback="标准品" items={block.standards || []} prefix={block.fieldPrefix || "layout/common/reference_standards"} nameHeader="标准品" />;
  if (block.type === "title") return <Heading block={block} fallback="操作方法" />;
  if (block.type === "operation_text") {
    return <p className={`mb-5 [text-indent:2em] ${BODY_TEXT_CLASS}`}>{block.parts?.length ? block.parts.map((part, index) => <Part key={index} part={part} context={context} />) : block.text}</p>;
  }
  if (block.type === "paragraph") return <p className={`mb-3 ${BODY_TEXT_CLASS}`}>{block.parts?.map((part, index) => <Part key={index} part={part} context={context} />)}</p>;
  if (block.type === "standard_text") return <PostSection block={block} title="标准规定">{test?.standardText || "YAML 未配置标准规定"}</PostSection>;
  if (block.type === "attachment_upload") return renderAttachment(block, context);
  if (block.type === "microbiology_cleanroom_exit") return renderCleanroomExit(block, context);
  if (block.type === "abnormal_handling") return renderAbnormal(block, context);
  if (block.type === "cleanup_checklist") return renderCleanup(block, context);
  if (block.type === "conclusion") return renderConclusion(block, context);
  if (block.type === "table") return <TableBlock block={block} context={context} />;
  return block.text ? <p className={`mb-3 ${BODY_TEXT_CLASS}`}>{block.text}</p> : null;
}

function renderAttachment(block: NumberedBlock, context: LayoutRenderContext) {
  const key = block.fieldKey || "layout/raw_data/attachments";
  return (
    <PostSection block={block} title="原始数据">
      <span>{block.text}</span>
      {context.advancedMode ? <Part part={{ type: "line", fieldKey: key, underline: true }} context={context} /> : (
        <>
          <ActionButton className="ml-4 px-3 py-1 text-sm" onClick={() => context.onFieldChange(key, context.values[key] || "待上传")}>{block.buttonText || "上传"}</ActionButton>
          <HiddenDataField fieldKey={key} value={context.values[key]} />
        </>
      )}
    </PostSection>
  );
}

function renderCleanroomExit(block: NumberedBlock, context: LayoutRenderContext) {
  const key = block.fieldKey || "layout/microbiology/cleanroom_exit_confirmed";
  return <PostSection block={block} title="清场"><span>{block.text}</span><span className="ml-8">{context.advancedMode ? <Part part={{ type: "radio", fieldKey: key, options: ["是", "否"] }} context={context} /> : <QcPaperChoiceInput fieldKey={key} value={context.values[key]} onChange={(value) => context.onFieldChange(key, value)} />}</span></PostSection>;
}

function renderAbnormal(block: NumberedBlock, context: LayoutRenderContext) {
  const prefix = block.fieldPrefix || "layout/abnormal";
  return <PostSection block={block} title="实验结果异常处理">{context.advancedMode ? <Part part={{ type: "radio", fieldKey: `${prefix}/occurred`, options: ["是", "否"] }} context={context} /> : <QcPaperChoiceInput fieldKey={`${prefix}/occurred`} value={context.values[`${prefix}/occurred`]} onChange={(value) => context.onFieldChange(`${prefix}/occurred`, value)} />} <span className="ml-8">实验室异常情况编号</span>{context.advancedMode ? <Part part={{ type: "line", fieldKey: `${prefix}/code`, width: "14rem", underline: true }} context={context} /> : <QcPaperLineInput part={{ type: "line", fieldKey: `${prefix}/code`, width: "14rem" }} value={context.values[`${prefix}/code`]} onChange={(value) => context.onFieldChange(`${prefix}/code`, value)} />}</PostSection>;
}

function renderCleanup(block: NumberedBlock, context: LayoutRenderContext) {
  const items = context.test?.cleanupItems?.length ? context.test.cleanupItems : block.items || ["YAML 未配置清场项目"];
  return <PostSection block={block} title="清场">{items.map((item, index) => {
    const key = `${block.fieldPrefix || "layout/cleanup"}/item_${index + 1}`;
    return <div key={`${key}-${item}`} className="flex items-center gap-6 border-b border-slate-950 py-1"><span className="min-w-0 flex-1">{item.replace(/[。.]?$/, "。")}</span><span className="inline-flex w-44 justify-center">{context.advancedMode ? <Part part={{ type: "radio", fieldKey: key, options: ["是", "否"] }} context={context} /> : <QcPaperChoiceInput fieldKey={key} value={context.values[key]} onChange={(value) => context.onFieldChange(key, value)} />}</span></div>;
  })}</PostSection>;
}

function renderConclusion(block: NumberedBlock, context: LayoutRenderContext) {
  const test = context.test;
  const resultKey = test?.conclusionFieldKey || "layout/conclusion/result";
  const valueUnit = block.unit || (test?.standardText?.match(/%/) ? "%" : "");
  return (
    <PostSection block={block} title="结论">
      <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1 gap-y-0 whitespace-normal">
        <span>批号</span><Part part={{ type: "line", fieldKey: "batch_number", underline: true, width: "6rem" }} context={context} />
        <span>{test?.name || "本品"}（{block.conclusionName || test?.conclusionName || test?.name || "结论"}）检测过程</span><Part part={{ type: "select", fieldKey: "layout/conclusion/process", underline: true, options: ["符合", "不符合"] }} context={context} /><span>各项规定，结果</span>
        {block.hasValue || test?.hasNumericConclusion ? <><span>为</span><Part part={{ type: "field", field: "结论-结果", readonlyDisplay: true, underline: true }} context={context} />{valueUnit ? <span>{valueUnit}</span> : null}<span>，</span></> : null}
        <Part part={{ type: "select", fieldKey: resultKey, underline: true, options: ["符合", "不符合"] }} context={context} /><span>标准规定。</span>
      </span>
    </PostSection>
  );
}
