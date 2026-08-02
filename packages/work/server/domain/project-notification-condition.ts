import { createHash } from "node:crypto";
import { z } from "zod";

export const PROJECT_NOTIFICATION_SNAPSHOT_PATHS = [
  "project.status",
  "project.projectLevel",
  "project.completionPercent",
  "project.plannedStartDate",
  "project.plannedEndDate",
  "project.riskPresent",
  "project.isArchived",
  "signal.kind",
  "signal.changedField",
] as const;

export type ProjectNotificationSnapshotPath = (typeof PROJECT_NOTIFICATION_SNAPSHOT_PATHS)[number];
export type ProjectNotificationPrimitive = string | number | boolean | null;

export type ProjectNotificationCondition =
  | { op: "all"; conditions: ProjectNotificationCondition[] }
  | { op: "any"; conditions: ProjectNotificationCondition[] }
  | { op: "not"; condition: ProjectNotificationCondition }
  | {
      op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
      path: ProjectNotificationSnapshotPath;
      value: ProjectNotificationPrimitive;
    }
  | {
      op: "in";
      path: ProjectNotificationSnapshotPath;
      value: ProjectNotificationPrimitive[];
    }
  | {
      op: "notIn";
      path: ProjectNotificationSnapshotPath;
      value: ProjectNotificationPrimitive[];
    }
  | { op: "present"; path: ProjectNotificationSnapshotPath }
  | {
      op: "withinNextDays" | "daysOverdue";
      path: ProjectNotificationSnapshotPath;
      value: number;
    };

export type ProjectNotificationSnapshot = {
  project: {
    status: string;
    projectLevel: string;
    completionPercent: number | null;
    plannedStartDate: string | null;
    plannedEndDate: string | null;
    riskPresent: boolean;
    isArchived: boolean;
  };
  signal: {
    kind: string;
    changedField: string;
  };
};

const MAX_DEPTH = 4;
const MAX_PREDICATES = 32;
const MAX_SET_VALUES = 20;
const MAX_TEXT_LENGTH = 200;
const MAX_CANONICAL_LENGTH = 16_384;
const DATE_PATHS = new Set<ProjectNotificationSnapshotPath>([
  "project.plannedStartDate",
  "project.plannedEndDate",
]);
const STRING_PATHS = new Set<ProjectNotificationSnapshotPath>([
  "project.status",
  "project.projectLevel",
  "project.plannedStartDate",
  "project.plannedEndDate",
  "signal.kind",
  "signal.changedField",
]);
const BOOLEAN_PATHS = new Set<ProjectNotificationSnapshotPath>([
  "project.riskPresent",
  "project.isArchived",
]);
const NUMBER_PATHS = new Set<ProjectNotificationSnapshotPath>([
  "project.completionPercent",
]);

const pathSchema = z.enum(PROJECT_NOTIFICATION_SNAPSHOT_PATHS);
const primitiveSchema = z.union([
  z.string().max(MAX_TEXT_LENGTH),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const scalarPredicateSchema = z.object({
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte"]),
  path: pathSchema,
  value: primitiveSchema,
}).strict();

const inPredicateSchema = z.object({
  op: z.literal("in"),
  path: pathSchema,
  value: z.array(primitiveSchema).min(1).max(MAX_SET_VALUES),
}).strict();

const notInPredicateSchema = z.object({
  op: z.literal("notIn"),
  path: pathSchema,
  value: z.array(primitiveSchema).min(1).max(MAX_SET_VALUES),
}).strict();

const presencePredicateSchema = z.object({
  op: z.literal("present"),
  path: pathSchema,
}).strict();

const relativeDatePredicateSchema = z.object({
  op: z.enum(["withinNextDays", "daysOverdue"]),
  path: pathSchema,
  value: z.number().int().min(0).max(3_650),
}).strict();

const expressionSchema: z.ZodType<ProjectNotificationCondition> = z.lazy(() => z.union([
  z.object({
    op: z.literal("all"),
    conditions: z.array(expressionSchema).min(1).max(MAX_PREDICATES),
  }).strict(),
  z.object({
    op: z.literal("any"),
    conditions: z.array(expressionSchema).min(1).max(MAX_PREDICATES),
  }).strict(),
  z.object({
    op: z.literal("not"),
    condition: expressionSchema,
  }).strict(),
  scalarPredicateSchema,
  inPredicateSchema,
  notInPredicateSchema,
  presencePredicateSchema,
  relativeDatePredicateSchema,
]));

export const projectNotificationConditionSchema = expressionSchema.superRefine((condition, context) => {
  let predicateCount = 0;

  function visit(node: ProjectNotificationCondition, depth: number, path: Array<string | number>) {
    if (depth > MAX_DEPTH) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `通知条件嵌套深度不能超过 ${MAX_DEPTH}`,
      });
      return;
    }
    if (node.op === "all" || node.op === "any") {
      node.conditions.forEach((child, index) => visit(child, depth + 1, [...path, "conditions", index]));
      return;
    }
    if (node.op === "not") {
      visit(node.condition, depth + 1, [...path, "condition"]);
      return;
    }

    predicateCount += 1;
    if (node.op === "withinNextDays" || node.op === "daysOverdue") {
      if (!DATE_PATHS.has(node.path)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, "path"],
          message: "相对日期操作仅支持项目计划开始日或计划结束日",
        });
      }
      return;
    }
    if (node.op === "present") return;

    const values = Array.isArray(node.value) ? node.value : [node.value];
    for (const value of values) {
      if (!valueMatchesPath(node.path, value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, "value"],
          message: `${node.path} 的比较值类型无效`,
        });
        break;
      }
    }
    if (node.op === "gt" || node.op === "gte" || node.op === "lt" || node.op === "lte") {
      if (!DATE_PATHS.has(node.path) && !NUMBER_PATHS.has(node.path)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, "path"],
          message: "大小比较仅支持完成百分比和项目计划日期",
        });
      }
      if (node.value === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, "value"],
          message: "大小比较值不能为空",
        });
      }
    }
  }

  visit(condition, 1, []);
  if (predicateCount > MAX_PREDICATES) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `通知条件谓词不能超过 ${MAX_PREDICATES} 个`,
    });
  }
  if (canonicalJson(condition).length > MAX_CANONICAL_LENGTH) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "通知条件内容过长",
    });
  }
});

export type PreparedProjectNotificationCondition = {
  condition: ProjectNotificationCondition;
  canonicalJson: string;
  fingerprint: string;
};

export function prepareProjectNotificationCondition(input: unknown):
  | { ok: true; data: PreparedProjectNotificationCondition }
  | { ok: false; error: string } {
  const parsed = projectNotificationConditionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "通知条件无效" };
  }
  const normalized = canonicalJson(parsed.data);
  return {
    ok: true,
    data: {
      condition: parsed.data,
      canonicalJson: normalized,
      fingerprint: sha256(normalized),
    },
  };
}

export function evaluateProjectNotificationCondition(input: {
  condition: ProjectNotificationCondition;
  snapshot: ProjectNotificationSnapshot;
  businessDate: string;
}): boolean {
  const { condition, snapshot, businessDate } = input;
  if (condition.op === "all") {
    return condition.conditions.every((child) => evaluateProjectNotificationCondition({
      condition: child,
      snapshot,
      businessDate,
    }));
  }
  if (condition.op === "any") {
    return condition.conditions.some((child) => evaluateProjectNotificationCondition({
      condition: child,
      snapshot,
      businessDate,
    }));
  }
  if (condition.op === "not") {
    return !evaluateProjectNotificationCondition({
      condition: condition.condition,
      snapshot,
      businessDate,
    });
  }

  const actual = readSnapshotPath(snapshot, condition.path);
  if (condition.op === "present") return actual !== null && actual !== undefined && actual !== "";
  if (condition.op === "withinNextDays" || condition.op === "daysOverdue") {
    if (typeof actual !== "string") return false;
    const targetDay = businessDayOrdinal(actual);
    const today = businessDayOrdinal(businessDate);
    if (targetDay === null || today === null) return false;
    const difference = targetDay - today;
    return condition.op === "withinNextDays"
      ? difference >= 0 && difference <= condition.value
      : difference < 0 && -difference >= condition.value;
  }
  if (condition.op === "in" || condition.op === "notIn") {
    const included = condition.value.some((candidate) => candidate === actual);
    return condition.op === "in" ? included : !included;
  }
  if (condition.op === "eq") return actual === condition.value;
  if (condition.op === "neq") return actual !== condition.value;
  if (actual === null || condition.value === null) return false;

  const left = comparableValue(condition.path, actual);
  const right = comparableValue(condition.path, condition.value);
  if (left === null || right === null) return false;
  if (condition.op === "gt") return left > right;
  if (condition.op === "gte") return left >= right;
  if (condition.op === "lt") return left < right;
  return left <= right;
}

export function projectNotificationFactsFingerprint(snapshot: ProjectNotificationSnapshot) {
  return sha256(canonicalJson(snapshot));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareText)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function readSnapshotPath(
  snapshot: ProjectNotificationSnapshot,
  path: ProjectNotificationSnapshotPath,
): ProjectNotificationPrimitive {
  switch (path) {
    case "project.status": return snapshot.project.status;
    case "project.projectLevel": return snapshot.project.projectLevel;
    case "project.completionPercent": return snapshot.project.completionPercent;
    case "project.plannedStartDate": return snapshot.project.plannedStartDate;
    case "project.plannedEndDate": return snapshot.project.plannedEndDate;
    case "project.riskPresent": return snapshot.project.riskPresent;
    case "project.isArchived": return snapshot.project.isArchived;
    case "signal.kind": return snapshot.signal.kind;
    case "signal.changedField": return snapshot.signal.changedField;
  }
}

function valueMatchesPath(path: ProjectNotificationSnapshotPath, value: ProjectNotificationPrimitive) {
  if (value === null) return true;
  if (STRING_PATHS.has(path)) {
    return typeof value === "string" && (!DATE_PATHS.has(path) || businessDayOrdinal(value) !== null);
  }
  if (BOOLEAN_PATHS.has(path)) return typeof value === "boolean";
  if (NUMBER_PATHS.has(path)) return typeof value === "number" && Number.isFinite(value);
  return false;
}

function comparableValue(
  path: ProjectNotificationSnapshotPath,
  value: ProjectNotificationPrimitive,
): number | null {
  if (DATE_PATHS.has(path)) return typeof value === "string" ? businessDayOrdinal(value) : null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function businessDayOrdinal(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ordinal = Date.UTC(year, month - 1, day) / 86_400_000;
  const parsed = new Date(ordinal * 86_400_000);
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
    ? ordinal
    : null;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}
