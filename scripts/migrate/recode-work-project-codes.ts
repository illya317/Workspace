import "dotenv/config";

import { prisma } from "@workspace/platform/server/prisma";
import {
  formatProjectBusinessCode,
  type BusinessCodeConfig,
} from "@workspace/platform/business-code-config";
import { getBusinessCodeConfig } from "@workspace/platform/server/system-config";

type ProjectCodeRow = {
  id: number;
  projectType: string | null;
  code: string | null;
  startDate: Date | string | null;
  createdAt: Date | string | null;
};

type ProjectCodePlan = {
  id: number;
  projectType: "company" | "other";
  currentCode: string | null;
  nextCode: string;
};

function parseDateYear(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
}

function projectYear(project: ProjectCodeRow) {
  const fromLegacyCode = project.code?.match(/^FH-(\d{2})-\d+$/)?.[1];
  if (fromLegacyCode) return 2000 + Number(fromLegacyCode);
  return parseDateYear(project.startDate)
    ?? parseDateYear(project.createdAt)
    ?? new Date().getFullYear();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function codeSequence(
  project: ProjectCodeRow,
  year: number,
  numbering: BusinessCodeConfig["project"],
) {
  const yearToken = numbering.yearDigits === 4 ? String(year) : String(year % 100).padStart(2, "0");
  const match = project.code?.match(new RegExp(
    `^${escapeRegex(numbering.companyPrefix)}${escapeRegex(numbering.separator)}${yearToken}${escapeRegex(numbering.separator)}(\\d+)$`,
  ));
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function projectSortKey(project: ProjectCodeRow) {
  if (!project.createdAt) return project.id;
  const date = project.createdAt instanceof Date ? project.createdAt : new Date(project.createdAt);
  return Number.isNaN(date.getTime()) ? project.id : date.getTime();
}

function compareSequence(
  a: ProjectCodeRow,
  b: ProjectCodeRow,
  year: number,
  numbering: BusinessCodeConfig["project"],
) {
  const left = codeSequence(a, year, numbering);
  const right = codeSequence(b, year, numbering);
  if (left === right) return 0;
  if (left === Number.POSITIVE_INFINITY) return 1;
  if (right === Number.POSITIVE_INFINITY) return -1;
  return left - right;
}

function buildGroupPlan(
  rows: ProjectCodeRow[],
  projectType: "company" | "other",
  year: number,
  numbering: BusinessCodeConfig["project"],
) {
  const start = projectType === "other"
    ? numbering.otherSequenceStart
    : numbering.companySequenceStart;
  const end = projectType === "company"
    ? numbering.companySequenceEnd
    : Number.POSITIVE_INFINITY;
  const sequenceLength = projectType === "other"
    ? numbering.otherSequenceLength
    : numbering.companySequenceLength;
  return rows
    .sort((a, b) => (
      compareSequence(a, b, year, numbering)
      || projectSortKey(a) - projectSortKey(b)
      || a.id - b.id
    ))
    .map((project, index) => {
      const sequence = start + index;
      if (sequence > end) {
        throw new Error(`公司项目 ${year} 年号段已超过 ${String(end).padStart(sequenceLength, "0")}`);
      }
      return {
        id: project.id,
        projectType,
        currentCode: project.code,
        nextCode: formatProjectBusinessCode({
          prefix: numbering.companyPrefix,
          year,
          sequence,
          separator: numbering.separator,
          yearDigits: numbering.yearDigits,
          sequenceLength,
        }),
      };
    });
}

function buildPlan(
  rows: ProjectCodeRow[],
  numbering: BusinessCodeConfig["project"],
) {
  const groups = new Map<string, ProjectCodeRow[]>();
  for (const row of rows) {
    if (row.projectType !== "company" && row.projectType !== "other") continue;
    const year = projectYear(row);
    const key = `${row.projectType}:${year}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const plan: ProjectCodePlan[] = [];
  for (const [key, groupRows] of groups.entries()) {
    const [projectType, yearText] = key.split(":") as ["company" | "other", string];
    plan.push(...buildGroupPlan(groupRows, projectType, Number(yearText), numbering));
  }
  return plan.sort((a, b) => a.nextCode.localeCompare(b.nextCode, "zh-Hans-CN"));
}

function printPlan(plan: ProjectCodePlan[]) {
  if (plan.length === 0) {
    console.log("No company/other project codes need recalculation.");
    return;
  }
  console.table(plan.map((item) => ({
    id: item.id,
    type: item.projectType,
    from: item.currentCode ?? "(null)",
    to: item.nextCode,
    changed: item.currentCode !== item.nextCode,
  })));
}

async function applyPlan(plan: ProjectCodePlan[]) {
  const changed = plan.filter((item) => item.currentCode !== item.nextCode);
  if (changed.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    for (const item of changed) {
      await tx.$executeRaw`
        UPDATE "Project" SET "code" = ${`__project_code_migration_${item.id}`} WHERE "id" = ${item.id}
      `;
    }
    for (const item of changed) {
      await tx.$executeRaw`
        UPDATE "Project" SET "code" = ${item.nextCode} WHERE "id" = ${item.id}
      `;
    }
  });
  return changed.length;
}

async function main() {
  const execute = process.argv.includes("--execute");
  const rows = await prisma.$queryRaw<ProjectCodeRow[]>`
    SELECT "id", "projectType", "code", "startDate", "createdAt"
    FROM "Project"
    WHERE "projectType" IN ('company', 'other')
    ORDER BY "id" ASC
  `;
  const numbering = (await getBusinessCodeConfig()).project;
  const plan = buildPlan(rows, numbering);
  printPlan(plan);
  if (!execute) {
    console.log("Dry run only. Re-run with --execute to update the database.");
    return;
  }
  const count = await applyPlan(plan);
  console.log(`Updated ${count} project code(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
