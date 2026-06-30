import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart, QcTemplateTestItem } from "./types";

export function environmentRows(block: QcLayoutBlock): QcLayoutCell[][] {
  const prefix = block.fieldPrefix || "layout/environment";
  return [
    [cell(`${block.title || "实验环境"}：温度：${block.temperatureRange || "10℃～30℃"}，湿度${block.humidityLimit || "≤75%"}`, [], 8, { bold: true, align: "left" })],
    ...Array.from({ length: block.roomRows || 1 }, (_, index) => {
      const rowNo = index + 1;
      return [
        cell("房间名称"), cell("", [{ type: "line", fieldKey: `${prefix}/room_name_${rowNo}`, width: "6.5rem" }]),
        cell("房间编号"), cell("", [{ type: "line", fieldKey: `${prefix}/room_no_${rowNo}`, width: "6.5rem" }]),
        cell("温度"), cell("", [{ type: "line", fieldKey: `${prefix}/temperature_${rowNo}`, width: "1.4rem" }, { type: "text", text: "℃" }]),
        cell("湿度"), cell("", [{ type: "line", fieldKey: `${prefix}/humidity_${rowNo}`, width: "3.4rem" }, { type: "text", text: "%" }]),
      ];
    }),
  ];
}

export function equipmentRows(block: QcLayoutBlock): QcLayoutCell[][] {
  const prefix = block.fieldPrefix || "layout/equipment";
  const devices = block.devices?.length ? block.devices : [{ name: "仪器、设备", status: "已清洁" }];
  return [
    [cell(block.title || "仪器、设备", [], 5, { bold: true, align: "left" })],
    ["仪器、设备", "设备编号", "设备状态", "校验有效期至", "是否确认"].map((text) => cell(text)),
    ...devices.map((device, index) => [
      cell(device.name),
      cell("", [{ type: "line", fieldKey: `${prefix}/device_no_${index + 1}`, width: "8rem" }]),
      cell((device.status || "已清洁").replace(/^["“]+|["”]+$/g, "")),
      cell("", [{ type: "date", fieldKey: `${prefix}/valid_until_${index + 1}` }]),
      cell("", [{ type: "radio", fieldKey: `${prefix}/confirmed_${index + 1}`, options: ["是", "否"] }]),
    ]),
  ];
}

export function verificationRows(block: QcLayoutBlock, items: Array<{ name: string }>, fallback: string, prefix: string): QcLayoutCell[][] {
  const records = items.length ? items : [{ name: fallback }];
  return [
    [cell(block.title || fallback, [], 4, { bold: true, align: "left" })],
    ["", "批号", "有效期至", "是否确认"].map((text, index) => cell(index === 0 ? fallback : text)),
    ...records.map((item, index) => [
      cell(item.name),
      cell("", [{ type: "line", fieldKey: `${prefix}/batch_no_${index + 1}`, width: "9rem" }]),
      cell("", [{ type: "date", fieldKey: `${prefix}/valid_until_${index + 1}` }]),
      cell("", [{ type: "radio", fieldKey: `${prefix}/confirmed_${index + 1}`, options: ["是", "否"] }]),
    ]),
  ];
}

export function cleanupRows(block: QcLayoutBlock, test?: QcTemplateTestItem): QcLayoutCell[][] {
  const items = test?.cleanupItems?.length ? test.cleanupItems : block.items || ["YAML 未配置清场项目"];
  const prefix = block.fieldPrefix || "layout/cleanup";
  return [
    [cell("清场", [], 2, { bold: true, align: "left" })],
    [cell("清场项目"), cell("是否确认")],
    ...items.map((item, index) => [
      cell(item.replace(/[。.]?$/, "。")),
      cell("", [{ type: "radio", fieldKey: `${prefix}/item_${index + 1}`, options: ["是", "否"] }]),
    ]),
  ];
}

export function conclusionParts(block: QcLayoutBlock, test?: QcTemplateTestItem): QcLayoutPart[] {
  const resultKey = test?.conclusionFieldKey || "layout/conclusion/result";
  const valueUnit = block.unit || (test?.standardText?.match(/%/) ? "%" : "");
  const valuePart = conclusionValuePart(block, test);
  const parts: QcLayoutPart[] = [
    { type: "text", text: "批号" },
    { type: "line", fieldKey: "batch_number", underline: true, width: "6rem" },
    { type: "text", text: `${test?.name || "本品"}（${block.conclusionName || test?.conclusionName || test?.name || "结论"}）检测过程` },
    { type: "select", fieldKey: "layout/conclusion/process", underline: true, options: ["符合", "不符合"] },
    { type: "text", text: "各项规定，结果" },
  ];
  if (block.hasValue || test?.hasNumericConclusion) {
    parts.push({ type: "text", text: "为" }, valuePart);
    if (valueUnit) parts.push({ type: "text", text: valueUnit });
    parts.push({ type: "text", text: "，" });
  }
  parts.push(
    { type: "select", fieldKey: resultKey, underline: true, options: ["符合", "不符合"] },
    { type: "text", text: "标准规定。" },
  );
  return parts;
}

export function textParts(text?: string): QcLayoutPart[] {
  return text ? [{ type: "text", text }] : [];
}

export function conclusionValuePart(block: QcLayoutBlock, test?: QcTemplateTestItem): QcLayoutPart {
  const sourceKey = inferConclusionValueSourceKey(block, test);
  return {
    type: "field",
    field: "结论-结果",
    readonlyDisplay: true,
    underline: true,
    ...(sourceKey ? {
      referenceFieldKey: sourceKey,
      valueSource: { type: "field_ref", fieldKey: sourceKey },
    } : {}),
  };
}

function inferConclusionValueSourceKey(block: QcLayoutBlock, test?: QcTemplateTestItem) {
  const fields = test?.methodGroups.flatMap((group) => group.fields) || [];
  const targetName = block.conclusionName || test?.conclusionName || test?.name || "";
  const ranked = fields
    .map((field, index) => ({ field, index, score: conclusionValueScore(field.name, targetName, field.attr, field.formula || field.rule) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0]?.field.fieldKey;
}

function conclusionValueScore(name: string, targetName: string, attr?: string, formula?: string) {
  const fieldName = name.trim();
  const target = targetName.trim();
  if (!fieldName) return 0;
  let score = attr === "calculated" || formula ? 20 : 0;
  if (target && fieldName === target) score += 100;
  if (target && (fieldName === `平均${target}` || fieldName === `${target}平均`)) score += 90;
  if (target && fieldName.includes(target) && fieldName.includes("平均")) score += 80;
  if (target && fieldName.includes(target)) score += 60;
  if (fieldName.includes("平均")) score += 40;
  if (/^(RD|RSD)$/i.test(fieldName) || /(?:RD|RSD|偏差|限度|上限|下限|判定|结论)/i.test(fieldName)) score -= 120;
  return score;
}

function cell(rawText: string, parts: QcLayoutPart[] = [], colspan = 1, extra: Partial<QcLayoutCell> = {}): QcLayoutCell {
  return { rawText, parts, colspan, rowspan: 1, isEmpty: false, align: "center", ...extra };
}
