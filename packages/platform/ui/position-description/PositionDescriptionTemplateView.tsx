"use client";

import {
  createEmptySection,
  createPageBody,
  PageSurface,
  type BodySurfaceCommandSpec,
} from "@workspace/core/ui";
import {
  EditorDocumentPreview,
  type EditorDocument,
  type EditorInline,
  type EditorSlotInline,
  type EditorTableBlock,
  type EditorTableRow,
} from "@workspace/platform/document-editor";
import { DocumentRuntimeValueSlot } from "../../document-editor/runtime-value-slot";

export interface PositionDescriptionTemplateData {
  code: string;
  name: string;
  departmentName?: string | null;
  reportTo?: string | null;
  positionPurpose?: string | null;
  summary?: string | null;
  headcount?: number | null;
  details?: Record<string, unknown> | null;
}

export interface PositionDescriptionTemplateDto {
  id: number | string;
  version: number;
  title: string;
  document: unknown;
  fieldModel?: unknown;
}

type DutyGroup = {
  title: string;
  items: string[];
};

type MajorItem = {
  category: string;
  specialty: string;
};

type ExperienceItem = {
  years: string;
  requirement: string;
};

type WorkEnvironmentItem = {
  area: string;
  factors: string[];
};

type BuildResult = {
  document: EditorDocument;
  values: Record<string, unknown>;
};

export function PositionDescriptionTemplateView({
  data,
  template,
  actions,
}: {
  data: PositionDescriptionTemplateData;
  template: PositionDescriptionTemplateDto | null;
  actions?: BodySurfaceCommandSpec[];
}) {
  return (
    <PageSurface
      kind="standard"
      body={createPageBody([
        createEmptySection("position-description-template-paper", {
          presentation: "plain",
          content: <PositionDescriptionTemplatePaper data={data} template={template} />,
        }),
      ], { commands: actions })}
    />
  );
}

export function PositionDescriptionTemplatePaper({
  data,
  template,
}: {
  data: PositionDescriptionTemplateData;
  template: PositionDescriptionTemplateDto | null;
}) {
  const rendered = template && isEditorDocument(template.document)
    ? buildPositionDescriptionDocument(template.document, data)
    : null;

  if (!rendered) return "未找到岗位说明书模板";

  return (
    <EditorDocumentPreview
      document={rendered.document}
      values={rendered.values}
      renderSlot={({ part, value }) => (
        <DocumentRuntimeValueSlot part={part} value={value} />
      )}
    />
  );
}

function buildPositionDescriptionDocument(template: EditorDocument, data: PositionDescriptionTemplateData): BuildResult {
  const values = buildBaseValues(data);
  const details = data.details || {};
  const duties = normalizeDuties(details.duties);
  const majors = normalizeMajors(details.major);
  const experiences = normalizeExperiences(details.experienceRequirements);
  const skills = normalizeStringList(details.skills);
  const workEnvironments = normalizeWorkEnvironments(details.workEnvironments);
  const document = cloneEditorDocument(template);

  document.blocks = document.blocks.map((block) => {
    if (block.type !== "table") return block;
    return expandTableBlock(block, {
      duties,
      majors,
      experiences,
      skills,
      workEnvironments,
      values,
    });
  });

  return { document, values };
}

function expandTableBlock(
  block: EditorTableBlock,
  input: {
    duties: DutyGroup[];
    majors: MajorItem[];
    experiences: ExperienceItem[];
    skills: string[];
    workEnvironments: WorkEnvironmentItem[];
    values: Record<string, unknown>;
  },
): EditorTableBlock {
  const rows: EditorTableRow[] = [];
  for (let index = 0; index < block.rows.length; index += 1) {
    const row = block.rows[index];
    if (row.id === "duties-title-template") {
      const itemRow = block.rows[index + 1];
      rows.push(...expandDutyRows(row, itemRow, input.duties, input.values));
      if (itemRow?.id === "duties-items-template") index += 1;
      continue;
    }
    if (row.id === "qualification-major-template") {
      rows.push(...expandObjectRows(row, input.majors, input.values, "qualification.major", (item, itemIndex) => ({
        "qualification.major.category": [`qualification.major.category.${itemIndex}`, item.category],
        "qualification.major.specialty": [`qualification.major.specialty.${itemIndex}`, item.specialty],
      })));
      continue;
    }
    if (row.id === "qualification-experience-template") {
      rows.push(...expandObjectRows(row, input.experiences, input.values, "qualification.experience", (item, itemIndex) => ({
        "qualification.experience.years": [`qualification.experience.years.${itemIndex}`, formatYears(item.years)],
        "qualification.experience.requirement": [`qualification.experience.requirement.${itemIndex}`, item.requirement],
      })));
      continue;
    }
    if (row.id === "qualification-skills-template") {
      rows.push(...expandStringRows(row, input.skills, input.values, "qualification.skills"));
      continue;
    }
    if (row.id === "conditions-environment-template") {
      rows.push(...expandObjectRows(row, input.workEnvironments, input.values, "conditions.workEnvironment", (item, itemIndex) => ({
        "conditions.workEnvironment.area": [`conditions.workEnvironment.area.${itemIndex}`, item.area],
        "conditions.workEnvironment.factors": [`conditions.workEnvironment.factors.${itemIndex}`, joinList(item.factors)],
      })));
      continue;
    }
    rows.push(row);
  }
  return { ...block, rows };
}

function expandDutyRows(
  titleTemplate: EditorTableRow,
  itemTemplate: EditorTableRow | undefined,
  sourceDuties: DutyGroup[],
  values: Record<string, unknown>,
) {
  const duties = sourceDuties.length ? sourceDuties : [{ title: "", items: [] }];
  const rows: EditorTableRow[] = [];
  duties.forEach((duty, index) => {
    const titleKey = `position.duties.title.${index}`;
    const itemsKey = `position.duties.items.${index}`;
    values[titleKey] = duty.title;
    values[itemsKey] = numberedLines(duty.items);

    const titleRow = replaceRowFieldKeys(titleTemplate, {
      "position.duties.title": titleKey,
    });
    titleRow.id = `${titleTemplate.id}-${index}`;
    replaceDutyOrdinal(titleRow, index + 1);
    if (index === 0) {
      if (titleRow.cells[0]) titleRow.cells[0].rowspan = duties.length * 2;
    } else {
      titleRow.cells = titleRow.cells.slice(1);
    }
    rows.push(titleRow);

    if (itemTemplate) {
      const itemRow = replaceRowFieldKeys(itemTemplate, {
        "position.duties.items": itemsKey,
      });
      itemRow.id = `${itemTemplate.id}-${index}`;
      rows.push(itemRow);
    }
  });
  return rows;
}

function expandObjectRows<T>(
  template: EditorTableRow,
  items: T[],
  values: Record<string, unknown>,
  keyPrefix: string,
  mapValues: (item: T, index: number) => Record<string, [string, unknown]>,
) {
  const rows: EditorTableRow[] = [];
  const sourceItems = items.length ? items : [null as T];
  sourceItems.forEach((item, index) => {
    const mapping = item ? mapValues(item, index) : {};
    const keyMap = Object.fromEntries(Object.entries(mapping).map(([from, [to, value]]) => {
      values[to] = value;
      return [from, to];
    }));
    const row = replaceRowFieldKeys(template, keyMap);
    row.id = `${template.id}-${index}`;
    if (index === 0) {
      if (row.cells[0]) row.cells[0].rowspan = sourceItems.length;
    } else {
      row.cells = row.cells.slice(1);
    }
    rows.push(row);
  });
  if (items.length === 0) {
    values[`${keyPrefix}.empty`] = "";
  }
  return rows;
}

function expandStringRows(
  template: EditorTableRow,
  items: string[],
  values: Record<string, unknown>,
  keyPrefix: string,
) {
  const rows: EditorTableRow[] = [];
  const sourceItems = items.length ? items : [""];
  sourceItems.forEach((item, index) => {
    const key = `${keyPrefix}.${index}`;
    values[key] = item ? `${index + 1}. ${item}` : "";
    const row = replaceRowFieldKeys(template, { [keyPrefix]: key });
    row.id = `${template.id}-${index}`;
    if (index === 0) {
      if (row.cells[0]) row.cells[0].rowspan = sourceItems.length;
    } else {
      row.cells = row.cells.slice(1);
    }
    rows.push(row);
  });
  return rows;
}

function buildBaseValues(data: PositionDescriptionTemplateData): Record<string, unknown> {
  const details = data.details || {};
  return {
    "position.name": data.name,
    "position.code": data.code,
    "position.departmentName": data.departmentName,
    "position.reportTo": data.reportTo,
    "position.subordinates": joinList(details.subordinates),
    "position.headcount": data.headcount,
    "position.purpose": data.positionPurpose || stringValue(details.purpose),
    "position.summary": data.summary,
    "position.externalCollaboration": joinList(details.externalCollaboration),
    "qualification.education": details.education,
    "qualification.major.summary": formatMajorSummary(normalizeMajors(details.major)),
    "qualification.experience.summary": formatExperienceSummary(normalizeExperiences(details.experienceRequirements)),
    "qualification.training": joinList(details.training),
    "qualification.otherRequirements": joinList(details.otherRequirements) || "无。",
    "conditions.workEnvironment.summary": formatWorkEnvironmentSummary(normalizeWorkEnvironments(details.workEnvironments)),
    "conditions.equipment": joinList(details.equipment),
    "conditions.workSchedule": details.workSchedule,
  };
}

function replaceRowFieldKeys(row: EditorTableRow, keyMap: Record<string, string>) {
  const cloned = cloneValue(row);
  for (const cell of cloned.cells) {
    cell.parts = cell.parts.map((part) => replaceInlineFieldKey(part, keyMap));
  }
  return cloned;
}

function replaceInlineFieldKey(part: EditorInline, keyMap: Record<string, string>): EditorInline {
  if (!("fieldKey" in part)) return part;
  const nextKey = keyMap[part.fieldKey];
  if (!nextKey) return part;
  return {
    ...part,
    fieldKey: nextKey,
    metadata: {
      ...part.metadata,
      templateFieldKey: (part as EditorSlotInline).metadata?.templateFieldKey ?? part.fieldKey,
    },
  };
}

function replaceDutyOrdinal(row: EditorTableRow, ordinal: number) {
  const titleCell = row.cells.find((cell) => cell.parts.some((part) => part.type === "text" && part.text.startsWith("职责")));
  if (!titleCell) return;
  titleCell.parts = titleCell.parts.map((part) => (
    part.type === "text" && part.text.startsWith("职责")
      ? { ...part, text: `职责${chineseOrdinal(ordinal)}：` }
      : part
  ));
}

function normalizeDuties(value: unknown): DutyGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const title = stringValue(item.title);
    const items = normalizeStringList(item.items);
    return title || items.length ? [{ title, items }] : [];
  });
}

function normalizeMajors(value: unknown): MajorItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    return [{ category: stringValue(item.category), specialty: stringValue(item.specialty) }];
  });
}

function normalizeExperiences(value: unknown): ExperienceItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    return [{ years: stringValue(item.years), requirement: stringValue(item.requirement) }];
  });
}

function normalizeWorkEnvironments(value: unknown): WorkEnvironmentItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    return [{ area: stringValue(item.area), factors: normalizeStringList(item.factors) }];
  });
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function formatMajorSummary(items: MajorItem[]) {
  return uniqueStrings(items.map((item) => item.specialty || item.category).filter(Boolean)).join("、");
}

function formatExperienceSummary(items: ExperienceItem[]) {
  return items.map((item) => {
    const years = formatYears(item.years);
    const requirement = item.requirement;
    if (years && requirement) return `${years}：${requirement}`;
    return years || requirement;
  }).filter(Boolean).join("；");
}

function formatWorkEnvironmentSummary(items: WorkEnvironmentItem[]) {
  return items.map((item) => {
    const factors = joinList(item.factors);
    if (item.area && factors) return `${item.area}：${factors}`;
    return item.area || factors;
  }).filter(Boolean).join("；");
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function numberedLines(items: string[]) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function joinList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => stringValue(item)).filter(Boolean).join("、");
  return stringValue(value);
}

function formatYears(value: unknown) {
  const text = stringValue(value);
  if (!text) return "";
  return text.endsWith("年") ? text : `${text}年`;
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isEditorDocument(value: unknown): value is EditorDocument {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { blocks?: unknown }).blocks));
}

function cloneEditorDocument(document: EditorDocument): EditorDocument {
  return cloneValue(document);
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function chineseOrdinal(value: number) {
  const units = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value <= 10) return value === 10 ? "十" : units[value];
  if (value < 20) return `十${units[value - 10]}`;
  const ten = Math.floor(value / 10);
  const unit = value % 10;
  return `${units[ten]}十${units[unit]}`;
}
