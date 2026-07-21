import { z } from "zod";

import type { QcTemplateStructurePatch } from "./qc-template-agent-structure";

const qcTemplateSearchSchema = z.object({
  keyword: z.string().trim().max(100).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
}).strict();

const qcTemplateInspectSchema = z.object({
  templateId: z.coerce.number().int().positive(),
  view: z.enum(["text", "outline", "value"]).default("text"),
  query: z.string().trim().max(200).optional(),
  path: z.string().trim().min(1).max(1_000).optional(),
}).strict();

const textReplacementSchema = z.object({
  from: z.string().min(1).max(500),
  to: z.string().max(5_000),
  match: z.enum(["exact", "substring"]),
  scope: z.enum(["document", "fieldModel", "both"]),
  expectedMatches: z.coerce.number().int().min(1).max(10_000),
}).strict();

const structurePathSchema = z.string().trim().min(1).max(1_000);
const patchValueSchema = z.unknown().refine((value) => value !== undefined, "结构补丁缺少 value");
const structurePatchSchema = z.discriminatedUnion("op", [
  z.object({ op: z.enum(["add", "replace"]), path: structurePathSchema, value: patchValueSchema }).strict(),
  z.object({ op: z.literal("remove"), path: structurePathSchema }).strict(),
  z.object({ op: z.enum(["copy", "move"]), from: structurePathSchema, path: structurePathSchema }).strict(),
  z.object({ op: z.literal("test"), path: structurePathSchema, value: patchValueSchema }).strict(),
]);

const qcTemplateUpdateSchema = z.object({
  templateId: z.coerce.number().int().positive(),
  version: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(120).optional(),
  replacements: z.array(textReplacementSchema).min(1).max(20).optional(),
  patches: z.array(structurePatchSchema).min(1).max(50).optional(),
}).strict()
  .refine((value) => Boolean(value.title || value.replacements?.length || value.patches?.length), {
    message: "请至少提供新标题、文本替换或结构补丁",
  })
  .refine((value) => value.patches?.some((patch) => patch.op !== "test") ?? true, {
    message: "结构补丁不能只有 test 操作",
  })
  .superRefine((value, ctx) => {
    if (!value.patches) return;
    try {
      if (JSON.stringify(value.patches).length > 500_000) {
        ctx.addIssue({ code: "custom", message: "结构补丁内容过大，请拆分为多次修改" });
      }
    } catch {
      ctx.addIssue({ code: "custom", message: "结构补丁必须是可序列化 JSON" });
    }
  });

const qcTemplatePublishSchema = z.object({
  templateId: z.coerce.number().int().positive(),
  version: z.coerce.number().int().positive(),
}).strict();

export type QcTemplateTextReplacement = z.infer<typeof textReplacementSchema>;
export type QcTemplateUpdateInput = Omit<z.infer<typeof qcTemplateUpdateSchema>, "patches"> & {
  patches?: QcTemplateStructurePatch[];
};

const editableTextKeys = new Set([
  "description",
  "label",
  "name",
  "placeholder",
  "rawText",
  "text",
  "title",
  "unit",
]);

type EditableTextNode = {
  path: string;
  key: string;
  value: string;
};

export function parseQcTemplateSearchInput(input: Record<string, unknown>) {
  return qcTemplateSearchSchema.safeParse(input);
}

export function parseQcTemplateInspectInput(input: Record<string, unknown>) {
  return qcTemplateInspectSchema.safeParse(input);
}

export function parseQcTemplateUpdateInput(input: Record<string, unknown>) {
  return qcTemplateUpdateSchema.safeParse(input);
}

export function parseQcTemplatePublishInput(input: Record<string, unknown>) {
  return qcTemplatePublishSchema.safeParse(input);
}

export function firstQcTemplateAgentValidationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "QC 模板参数无效";
}

export function inspectQcTemplateText(input: {
  document: unknown;
  fieldModel: unknown;
  query?: string;
  limit?: number;
}) {
  const query = input.query?.trim().toLocaleLowerCase("zh-CN") ?? "";
  const nodes = [
    ...collectEditableTextNodes(input.document, "/document"),
    ...collectEditableTextNodes(input.fieldModel, "/fieldModel"),
  ].filter((node) => !query || node.value.toLocaleLowerCase("zh-CN").includes(query));
  const limit = Math.max(1, Math.min(input.limit ?? 80, 200));
  return {
    totalMatches: nodes.length,
    truncated: nodes.length > limit,
    items: nodes.slice(0, limit),
  };
}

export function applyQcTemplateTextReplacements(input: {
  document: unknown;
  fieldModel: unknown;
  replacements: QcTemplateTextReplacement[];
}) {
  const next = {
    document: structuredClone(input.document),
    fieldModel: structuredClone(input.fieldModel),
  };
  const applied: Array<QcTemplateTextReplacement & { actualMatches: number }> = [];
  for (const replacement of input.replacements) {
    const targets = replacement.scope === "both"
      ? ["document", "fieldModel"] as const
      : [replacement.scope] as const;
    let actualMatches = 0;
    for (const target of targets) {
      actualMatches += replaceEditableText(next[target], replacement);
    }
    if (actualMatches !== replacement.expectedMatches) {
      return {
        ok: false as const,
        error: `文本“${replacement.from}”实际匹配 ${actualMatches} 处，与预期 ${replacement.expectedMatches} 处不一致；请重新检查模板后再修改。`,
      };
    }
    applied.push({ ...replacement, actualMatches });
  }
  return { ok: true as const, ...next, applied };
}

function collectEditableTextNodes(value: unknown, path: string): EditableTextNode[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectEditableTextNodes(item, `${path}/${index}`));
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const childPath = `${path}/${escapeJsonPointer(key)}`;
    if (typeof item === "string" && editableTextKeys.has(key) && item.trim()) {
      return [{ path: childPath, key, value: item }];
    }
    return collectEditableTextNodes(item, childPath);
  });
}

function replaceEditableText(value: unknown, replacement: QcTemplateTextReplacement): number {
  if (Array.isArray(value)) {
    return value.reduce((count, item) => count + replaceEditableText(item, replacement), 0);
  }
  if (!isRecord(value)) return 0;
  let count = 0;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && editableTextKeys.has(key)) {
      if (replacement.match === "exact") {
        if (item === replacement.from) {
          value[key] = replacement.to;
          count += 1;
        }
      } else {
        const matches = item.split(replacement.from).length - 1;
        if (matches > 0) {
          value[key] = item.replaceAll(replacement.from, replacement.to);
          count += matches;
        }
      }
    } else {
      count += replaceEditableText(item, replacement);
    }
  }
  return count;
}

function escapeJsonPointer(value: string) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
