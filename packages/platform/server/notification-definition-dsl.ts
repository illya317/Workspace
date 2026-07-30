import { createHash } from "node:crypto";
import { z } from "zod";

import { workspaceBasePath } from "@workspace/core/routing";
import { failCommand, okCommand, type DomainValidationResult } from "./domain-validation";

export type { NotificationResponseMode } from "./notification-definition-contract";

export const NOTIFICATION_TITLE_MAX_LENGTH = 120;
export const NOTIFICATION_BODY_MAX_LENGTH = 2_000;
export const NOTIFICATION_HREF_MAX_LENGTH = 600;
export const NOTIFICATION_VARIABLE_MAX_COUNT = 32;
export const NOTIFICATION_RECIPIENT_MAX_COUNT = 100;

const VARIABLE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const DEFINITION_KEY_PATTERN = /^custom\.[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TEMPLATE_TOKEN_PATTERN = /{{([a-z][a-z0-9_]{0,63})}}/g;

const WORKSPACE_API_BASE_PATHS = [...new Set(
  [workspaceBasePath, "/test", "/workspace"].map((basePath) => basePath.toLowerCase()).filter(Boolean),
)];

export const RESERVED_NOTIFICATION_VARIABLE_KEYS = new Set([
  "businessActionKey",
  "eventType",
  "flowType",
  "originatorUserId",
  "requestId",
  "resourceKey",
  "scopeId",
  "status",
  "submitterUserId",
  "workflowRole",
]);

const templateVariableValueSchema = z.union([
  z.string().max(NOTIFICATION_BODY_MAX_LENGTH),
  z.number().finite(),
  z.boolean(),
]);

const notificationVariablesSchema = z.record(
  z.string().regex(VARIABLE_KEY_PATTERN, "变量名只能使用小写字母、数字和下划线"),
  templateVariableValueSchema,
).superRefine((value, context) => {
  const keys = Object.keys(value);
  if (keys.length > NOTIFICATION_VARIABLE_MAX_COUNT) {
    context.addIssue({ code: "custom", message: `变量最多 ${NOTIFICATION_VARIABLE_MAX_COUNT} 个` });
  }
  for (const key of keys) {
    if (RESERVED_NOTIFICATION_VARIABLE_KEYS.has(key)) {
      context.addIssue({ code: "custom", path: [key], message: "变量名属于通知流程保留字段" });
    }
  }
});

export const notificationDefinitionSaveSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  expectedVersion: z.coerce.number().int().positive().optional(),
  key: z.string().trim().min(1).max(120).regex(DEFINITION_KEY_PATTERN, "通知定义 key 必须使用 custom.* 命名空间"),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  titleTemplate: z.string().trim().min(1).max(NOTIFICATION_TITLE_MAX_LENGTH),
  bodyTemplate: z.string().trim().min(1).max(NOTIFICATION_BODY_MAX_LENGTH),
  hrefTemplate: z.string().trim().max(NOTIFICATION_HREF_MAX_LENGTH).nullable().optional(),
  responseMode: z.enum(["read", "acknowledge"]),
  isImportant: z.boolean().default(false),
  allowProjectMonitoring: z.boolean().default(false),
  allowUserApi: z.boolean().default(false),
  allowedOpenApiClientIds: z.array(z.coerce.number().int().positive()).max(100).default([]),
}).strict().superRefine((value, context) => {
  if (value.id !== undefined && value.expectedVersion === undefined) {
    context.addIssue({ code: "custom", path: ["expectedVersion"], message: "更新通知定义必须提供 expectedVersion" });
  }
  if (value.id === undefined && value.expectedVersion !== undefined) {
    context.addIssue({ code: "custom", path: ["expectedVersion"], message: "新建通知定义不能提供 expectedVersion" });
  }
});

export const notificationDefinitionVersionSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
}).strict();

export const notificationPublicationSourceSchema = z.object({
  kind: z.enum(["internal", "user-api", "open-api"]),
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120),
}).strict();

export const notificationPublicationRequestSchema = z.object({
  definitionKey: z.string().trim().min(1).max(120).regex(DEFINITION_KEY_PATTERN, "通知定义 key 必须使用 custom.* 命名空间"),
  idempotencyKey: z.string().trim().regex(IDEMPOTENCY_KEY_PATTERN, "幂等键格式无效"),
  usernames: z.array(z.string().trim().min(1).max(120)).min(1).max(NOTIFICATION_RECIPIENT_MAX_COUNT),
  variables: notificationVariablesSchema,
}).strict();

export type NotificationDefinitionSaveInput = z.infer<typeof notificationDefinitionSaveSchema>;
export type NotificationDefinitionVersionInput = z.infer<typeof notificationDefinitionVersionSchema>;
export type NotificationPublicationSource = z.infer<typeof notificationPublicationSourceSchema>;
export type NotificationPublicationRequest = z.infer<typeof notificationPublicationRequestSchema>;
export type NotificationTemplateVariables = NotificationPublicationRequest["variables"];

export type PreparedNotificationDefinition = Omit<NotificationDefinitionSaveInput, "id" | "expectedVersion"> & {
  description: string | null;
  hrefTemplate: string | null;
  variableKeys: string[];
  contentFingerprint: string;
};

export type RenderableNotificationDefinition = Pick<
  PreparedNotificationDefinition,
  "titleTemplate" | "bodyTemplate" | "hrefTemplate" | "variableKeys"
>;

export type RenderedNotificationContent = {
  title: string;
  body: string;
  href: string | null;
};

export function prepareNotificationDefinition(
  input: NotificationDefinitionSaveInput,
): DomainValidationResult<PreparedNotificationDefinition> {
  const templates = [input.titleTemplate, input.bodyTemplate, input.hrefTemplate ?? ""];
  const variables = new Set<string>();
  for (const template of templates) {
    const syntax = validateTemplateSyntax(template);
    if (!syntax.ok) return syntax;
    for (const key of inferTemplateVariables(template)) {
      if (RESERVED_NOTIFICATION_VARIABLE_KEYS.has(key)) {
        return failCommand(`变量 ${key} 属于通知流程保留字段`, 400, "variables");
      }
      variables.add(key);
    }
  }
  if (variables.size > NOTIFICATION_VARIABLE_MAX_COUNT) {
    return failCommand(`变量最多 ${NOTIFICATION_VARIABLE_MAX_COUNT} 个`, 400, "variables");
  }
  if (input.hrefTemplate) {
    const placeholderHref = renderTemplate(input.hrefTemplate, Object.fromEntries(
      [...variables].map((key) => [key, "value"]),
    ));
    const href = validateWorkspaceHref(placeholderHref);
    if (!href.ok) return href;
  }
  const variableKeys = [...variables].sort();
  const prepared = {
    key: input.key,
    label: input.label,
    description: input.description?.trim() || null,
    titleTemplate: input.titleTemplate,
    bodyTemplate: input.bodyTemplate,
    hrefTemplate: input.hrefTemplate?.trim() || null,
    responseMode: input.responseMode,
    isImportant: input.isImportant,
    allowProjectMonitoring: input.allowProjectMonitoring,
    allowUserApi: input.allowUserApi,
    allowedOpenApiClientIds: [...new Set(input.allowedOpenApiClientIds)].sort((left, right) => left - right),
    variableKeys,
  };
  return okCommand({
    ...prepared,
    contentFingerprint: fingerprint(prepared),
  });
}

export function renderNotificationDefinition(
  definition: RenderableNotificationDefinition,
  variables: NotificationTemplateVariables,
): DomainValidationResult<RenderedNotificationContent> {
  const suppliedKeys = Object.keys(variables).sort();
  const expectedKeys = [...definition.variableKeys].sort();
  const missing = expectedKeys.filter((key) => !Object.hasOwn(variables, key));
  if (missing.length > 0) return failCommand(`缺少通知变量：${missing.join("、")}`, 400, "variables");
  const unknown = suppliedKeys.filter((key) => !expectedKeys.includes(key));
  if (unknown.length > 0) return failCommand(`存在未声明通知变量：${unknown.join("、")}`, 400, "variables");

  const title = renderTemplate(definition.titleTemplate, variables).trim();
  const body = renderTemplate(definition.bodyTemplate, variables).trim();
  const href = definition.hrefTemplate ? renderHrefTemplate(definition.hrefTemplate, variables).trim() : null;
  if (!title || title.length > NOTIFICATION_TITLE_MAX_LENGTH) {
    return failCommand(`通知标题不能为空且不能超过 ${NOTIFICATION_TITLE_MAX_LENGTH} 字`, 400, "title");
  }
  if (!body || body.length > NOTIFICATION_BODY_MAX_LENGTH) {
    return failCommand(`通知正文不能为空且不能超过 ${NOTIFICATION_BODY_MAX_LENGTH} 字`, 400, "body");
  }
  if (href) {
    const validHref = validateWorkspaceHref(href);
    if (!validHref.ok) return validHref;
  }
  return okCommand({ title, body, href: href || null });
}

export function inferTemplateVariables(template: string) {
  return [...template.matchAll(TEMPLATE_TOKEN_PATTERN)].map((match) => match[1]!);
}

function validateTemplateSyntax(template: string): DomainValidationResult<true> {
  const withoutTokens = template.replace(TEMPLATE_TOKEN_PATTERN, "");
  return withoutTokens.includes("{{") || withoutTokens.includes("}}")
    ? failCommand("通知模板变量语法无效，应使用 {{flat_key}}", 400, "template")
    : okCommand(true);
}

function renderTemplate(template: string, variables: Record<string, string | number | boolean>) {
  return template.replace(TEMPLATE_TOKEN_PATTERN, (_token, key: string) => String(variables[key] ?? ""));
}

function renderHrefTemplate(template: string, variables: Record<string, string | number | boolean>) {
  return template.replace(
    TEMPLATE_TOKEN_PATTERN,
    (_token, key: string) => encodeURIComponent(String(variables[key] ?? "")),
  );
}

function validateWorkspaceHref(href: string): DomainValidationResult<true> {
  if (href.length > NOTIFICATION_HREF_MAX_LENGTH) {
    return failCommand(`通知链接不能超过 ${NOTIFICATION_HREF_MAX_LENGTH} 字`, 400, "href");
  }
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\") || /[\u0000-\u001f]/.test(href)) {
    return failCommand("通知链接必须是站内绝对路径", 400, "href");
  }
  try {
    const parsed = new URL(href, "https://workspace.invalid");
    if (parsed.origin !== "https://workspace.invalid") return failCommand("通知链接必须是站内绝对路径", 400, "href");
    const decodedPathname = decodeURIComponent(parsed.pathname);
    if (decodedPathname.includes("\\")) return failCommand("通知链接必须是站内绝对路径", 400, "href");
    const normalized = new URL(decodedPathname, "https://workspace.invalid");
    if (normalized.origin !== "https://workspace.invalid") return failCommand("通知链接必须是站内绝对路径", 400, "href");
    const applicationPathname = stripWorkspaceBasePath(normalized.pathname.toLowerCase()).replace(/\/{2,}/g, "/");
    if (applicationPathname === "/api" || applicationPathname.startsWith("/api/")) {
      return failCommand("通知链接不能指向 API 路径", 400, "href");
    }
  } catch {
    return failCommand("通知链接格式无效", 400, "href");
  }
  return okCommand(true);
}

function stripWorkspaceBasePath(pathname: string) {
  for (const basePath of WORKSPACE_API_BASE_PATHS) {
    if (pathname === basePath) return "/";
    if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length);
  }
  return pathname;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
