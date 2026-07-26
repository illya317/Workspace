import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  actualEndDateForStatus,
  canEditActualEndDate,
  validateCompletionSchedule,
} from "../../packages/platform/completion-date-policy";

const ROOT = path.resolve(__dirname, "../..");

export type CompletionDatePolicyIssue = {
  file: string;
  line: number;
  message: string;
};

const MODEL_POLICY = [
  { file: "prisma/models/work-projects.prisma", model: "Project", required: ["status", "plannedStartDate", "plannedEndDate", "actualStartDate", "actualEndDate", "isArchived"], forbidden: ["baselineStartDate", "baselineEndDate", "startDate", "endDate"] },
  { file: "prisma/models/works.prisma", model: "WorkPlan", required: ["status", "isArchived", "plannedStartDate", "plannedEndDate", "actualStartDate", "actualEndDate"], forbidden: ["periodStart", "periodEnd"] },
  { file: "prisma/models/works.prisma", model: "WorkItem", required: ["status", "isArchived", "plannedStartDate", "plannedEndDate", "actualStartDate", "actualEndDate"], forbidden: ["startDate", "dueDate"] },
  { file: "prisma/models/work-projects.prisma", model: "ProjectPlanPhase", required: ["plannedStartDate", "plannedEndDate"], forbidden: ["startDate", "endDate"] },
  { file: "prisma/models/work-projects.prisma", model: "ProjectPlanBaselineItem", required: ["plannedStartDate", "plannedEndDate"], forbidden: ["startDate", "endDate"] },
  { file: "prisma/models/work-reports.prisma", model: "WorkReportItem", required: ["snapshotPlannedStartDate", "snapshotPlannedEndDate", "snapshotActualEndDate", "snapshotCompletedAt"], forbidden: ["plannedStartDateSnapshot", "plannedEndDateSnapshot", "actualEndDateSnapshot", "completedAtSnapshot"] },
] as const;

const SERVER_POLICY_EVIDENCE = [
  { file: "packages/work/server/domain/work-item-validation.ts", required: ["validateCompletionSchedule({"] },
  { file: "packages/work/server/work-plans.ts", required: ["validateCompletionSchedule({"] },
  { file: "packages/work/server/work-period-schedule.ts", required: ["validateCompletionSchedule({"] },
  { file: "packages/work/server/domain/project-validation.ts", required: ["validateCompletionSchedule("] },
  { file: "packages/work/server/project-plan.ts", required: ["validateCompletionSchedule({"] },
] as const;

const PUBLIC_ALIAS_RULES = [
  { files: ["app/api/modules/work/tasks/route.ts", "app/api/modules/work/tasks/[id]/route.ts"], forbidden: ["dueDate", "startDate"] },
  { files: ["app/api/modules/work/tasks/plans/route.ts", "app/api/modules/work/tasks/plans/[id]/route.ts"], forbidden: ["periodStart", "periodEnd"] },
  { files: ["packages/work/ui/works/types.ts", "packages/work/server/work-item-dto.ts"], forbidden: ["dueDate"] },
  { files: ["packages/work/ui/tabs/project/model.ts", "packages/work/server/projects.ts", "packages/work/server/domain/project-validation.ts"], forbidden: ["baselineStartDate", "baselineEndDate"] },
  { files: ["packages/work/server/task-reports.ts", "packages/hr/server/performance-contribution-detail.ts"], forbidden: ["plannedStartDateSnapshot", "plannedEndDateSnapshot", "actualEndDateSnapshot", "completedAtSnapshot"] },
] as const;

export function createCompletionDatePolicyIssues(): CompletionDatePolicyIssue[] {
  return [
    ...checkCanonicalModels(),
    ...checkPublicAliases(),
    ...checkActualDateFields(),
    ...checkServerPolicyEvidence(),
    ...checkPolicyBehavior(),
    ...checkRetiredLocalPolicies(),
  ];
}

function checkCanonicalModels() {
  const issues: CompletionDatePolicyIssue[] = [];
  for (const rule of MODEL_POLICY) {
    const source = read(rule.file);
    const block = modelBlock(source, rule.model);
    if (!block) {
      issues.push(issue(rule.file, 1, `缺少 Prisma model ${rule.model}`));
      continue;
    }
    const fields = new Set([...block.text.matchAll(/^\s*([A-Za-z_]\w*)\s+/gm)].map((match) => match[1]));
    for (const field of rule.required) {
      if (!fields.has(field)) issues.push(issue(rule.file, block.line, `${rule.model} 必须使用统一字段 ${field}`));
    }
    for (const field of rule.forbidden) {
      if (fields.has(field)) issues.push(issue(rule.file, block.line, `${rule.model} 禁止继续使用日期别名 ${field}`));
    }
  }
  return issues;
}

function checkPublicAliases() {
  const issues: CompletionDatePolicyIssue[] = [];
  for (const rule of PUBLIC_ALIAS_RULES) {
    for (const file of rule.files) {
      const source = read(file);
      for (const alias of rule.forbidden) {
        const match = new RegExp(`\\b${alias}\\b`).exec(source);
        if (match) issues.push(issue(file, lineAt(source, match.index), `公开 contract 禁止使用旧日期别名 ${alias}`));
      }
    }
  }
  const typeSource = read("packages/work/ui/works/types.ts");
  const workItemStatus = /export type WorkItemStatus\s*=([^;]+);/.exec(typeSource)?.[1] ?? "";
  if (!workItemStatus.includes('"active"') || workItemStatus.includes('"doing"') || workItemStatus.includes('"archived"')) {
    issues.push(issue("packages/work/ui/works/types.ts", 1, "WorkItemStatus 必须使用 active/paused/done，归档单独使用 isArchived"));
  }
  const workPlanStatus = /status:\s*([^;]+);/.exec(typeSource)?.[1] ?? "";
  if (!workPlanStatus.includes('"active"') || !workPlanStatus.includes('"done"') || workPlanStatus.includes('"closed"') || workPlanStatus.includes('"archived"')) {
    issues.push(issue("packages/work/ui/works/types.ts", 1, "WorkPlan status 必须使用 active/done，归档单独使用 isArchived"));
  }
  return issues;
}

function checkActualDateFields() {
  const issues: CompletionDatePolicyIssue[] = [];
  for (const file of packageUiSourceFiles()) {
    const sourceText = fs.readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const label = literalProperty(node, "label");
        if (label === "实际开始" || label === "实际结束" || label === "实际完成") {
          const expectedKey = label === "实际开始" ? "actualStartDate" : "actualEndDate";
          const declaration = node.getText(source);
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          if (literalProperty(node, "key") !== expectedKey) {
            issues.push(issue(relative(file), line, `${label}字段 key 必须为 ${expectedKey}`));
          }
          if (!/maxDate\s*:\s*todayDateString\s*\(\s*\)/.test(declaration)) {
            issues.push(issue(relative(file), line, `${label}字段必须设置 maxDate: todayDateString()`));
          }
          if (expectedKey === "actualEndDate" && !/canEditActualEndDate\s*\(/.test(declaration)) {
            issues.push(issue(relative(file), line, "实际结束字段必须由 canEditActualEndDate() 控制可编辑状态"));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return issues;
}

function checkServerPolicyEvidence() {
  const issues: CompletionDatePolicyIssue[] = [];
  for (const entry of SERVER_POLICY_EVIDENCE) {
    const source = read(entry.file);
    for (const evidence of entry.required) {
      if (!source.includes(evidence)) issues.push(issue(entry.file, 1, `完成/日期 domain policy 缺少证据：${evidence}`));
    }
  }
  const shared = read("packages/platform/completion-date-policy.ts");
  for (const evidence of ["实际开始不能晚于今日", "实际结束不能晚于今日", "请先选择已完成，再填写实际结束", "计划结束不能早于计划开始", "实际结束不能早于实际开始"]) {
    if (!shared.includes(evidence)) issues.push(issue("packages/platform/completion-date-policy.ts", 1, `共享完成/日期策略缺少规则：${evidence}`));
  }
  return issues;
}

function checkRetiredLocalPolicies() {
  return ["packages/work/work-date-policy.ts", "packages/work/work-completion-policy.ts", "packages/work/server/project-dates.ts"]
    .filter((file) => fs.existsSync(path.join(ROOT, file)))
    .map((file) => issue(file, 1, "局部完成/日期策略已废弃，必须统一使用 Platform policy"));
}

function checkPolicyBehavior() {
  const file = "packages/platform/completion-date-policy.ts";
  const today = "2026-07-10";
  const cases: Array<{ name: string; actual: string | null; expected: string | null }> = [
    { name: "实际开始未来日期", actual: validateCompletionSchedule({ status: "active", actualStartDate: "2026-07-11", today }), expected: "实际开始不能晚于今日" },
    { name: "实际结束未来日期", actual: validateCompletionSchedule({ status: "done", actualEndDate: "2026-07-11", today }), expected: "实际结束不能晚于今日" },
    { name: "未完成填写实际结束", actual: validateCompletionSchedule({ status: "active", actualEndDate: today, today }), expected: "请先选择已完成，再填写实际结束" },
    { name: "已完成可不填实际结束", actual: validateCompletionSchedule({ status: "done", today }), expected: null },
    { name: "计划日期倒置", actual: validateCompletionSchedule({ status: "active", plannedStartDate: "2026-07-10", plannedEndDate: "2026-07-09", today }), expected: "计划结束不能早于计划开始" },
    { name: "实际日期倒置", actual: validateCompletionSchedule({ status: "done", actualStartDate: "2026-07-10", actualEndDate: "2026-07-09", today }), expected: "实际结束不能早于实际开始" },
  ];
  const issues = cases
    .filter((entry) => entry.actual !== entry.expected)
    .map((entry) => issue(file, 1, `共享策略行为异常：${entry.name}`));
  if (!canEditActualEndDate("done") || canEditActualEndDate("active")) issues.push(issue(file, 1, "实际结束可编辑状态必须只由 done 开启"));
  if (actualEndDateForStatus("active", today) !== null || actualEndDateForStatus("done", today) !== today) issues.push(issue(file, 1, "状态离开 done 时必须清空实际结束"));
  return issues;
}

function modelBlock(source: string, model: string) {
  const match = new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`, "m").exec(source);
  return match ? { text: match[1], line: lineAt(source, match.index) } : null;
}

function packageUiSourceFiles() {
  const packagesRoot = path.join(ROOT, "packages");
  return fs.readdirSync(packagesRoot, { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory() ? sourceFiles(path.join(packagesRoot, entry.name, "ui")) : []
  ));
}

function sourceFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

function literalProperty(node: ts.ObjectLiteralExpression, key: string) {
  const property = node.properties.find((item) => ts.isPropertyAssignment(item) && propertyName(item.name) === key);
  return property && ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer) ? property.initializer.text : null;
}

function propertyName(name: ts.PropertyName) {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : "";
}

function read(file: string) {
  const absolute = path.join(ROOT, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
}

function issue(file: string, line: number, message: string): CompletionDatePolicyIssue {
  return { file, line, message };
}

function lineAt(source: string, index: number) {
  return source.slice(0, index).split("\n").length;
}

function relative(file: string) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}
