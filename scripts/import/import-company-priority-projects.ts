import "dotenv/config";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../generated/prisma/client";

type StructuredTask = {
  sortOrder: number;
  title: string;
};

type StructuredProject = {
  code: string;
  serialNo: number;
  rawSeq: string;
  type: "重点项目";
  name: string;
  ownerEmployeeName: string;
  ownerEmployeeId: number | null;
  tasks: StructuredTask[];
  source: {
    file: string;
    sheet: string;
    rowNumber: number;
  };
};

type CliOptions = {
  file: string;
  jsonOut: string;
  execute: boolean;
};

function expandTilde(input: string) {
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function requireDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL 未配置，无法导入本地数据库。");
  }
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(`当前 DATABASE_URL 不是 SQLite file: 路径：${databaseUrl}`);
  }
  const dbPath = expandTilde(databaseUrl.slice("file:".length).replace(/^"|"$/g, ""));
  if (!path.isAbsolute(dbPath)) {
    throw new Error(`DATABASE_URL 必须是绝对路径，当前为：${dbPath}`);
  }
  return dbPath;
}

function parseArgs(argv: string[]): CliOptions {
  const inputDir = process.env.COMPANY_TASK_PLANS_INPUT_DIR?.trim() || ".";
  const outputDir = process.env.COMPANY_TASK_PLANS_OUTPUT_DIR?.trim() || ".";
  const defaults = {
    file: path.join(inputDir, "公司6月份重点工作计划2026.5.26.xlsx"),
    jsonOut: path.join(outputDir, "公司6月份重点工作计划2026.5.26.company-projects.json"),
    execute: false,
  };
  const options: CliOptions = { ...defaults };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") {
      options.execute = true;
      continue;
    }
    if (arg === "--file") {
      options.file = expandTilde(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (arg === "--json-out") {
      options.jsonOut = expandTilde(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
  }

  return options;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function normalizeSeq(value: unknown) {
  const text = normalizeText(value);
  if (!text) return "";
  const numeric = Number(text);
  if (Number.isFinite(numeric) && text.includes(".")) return String(numeric);
  return text;
}

function isCompanyGoalRow(row: unknown[]) {
  const seq = normalizeSeq(row[0]);
  const name = normalizeText(row[1]);
  const tasks = normalizeText(row[2]);
  if (!seq || !name || !tasks) return false;
  if (seq === "序号" || seq === "合计") return false;
  return true;
}

function extractTasks(text: string) {
  const normalized = normalizeText(text)
    .replace(/([：:；;])\s*(\d+\s*[、.）)])/g, "$1\n$2")
    .replace(/\s{2,}(\d+\s*[、.）)])/g, "\n$1")
    .replace(/([^\n])\s+(\d+\s*[、.）)])/g, "$1\n$2");
  if (!normalized) return [] as string[];

  const firstMarker = normalized.search(/\d+\s*[、.）)]/);
  let prefix = "";
  let body = normalized;
  if (firstMarker > 0) {
    prefix = normalizeText(normalized.slice(0, firstMarker)).replace(/[：:；;，,\- ]+$/g, "");
    body = normalized.slice(firstMarker);
  }

  const matches = [...body.matchAll(/(?:^|\n)\s*(\d+)\s*[、.）)]\s*([\s\S]*?)(?=(?:\n\s*\d+\s*[、.）)])|$)/g)];
  if (matches.length > 0) {
    return matches
      .map((match) => normalizeText(match[2]).replace(/[；;]+$/g, ""))
      .filter(Boolean)
      .map((item) => (prefix && !item.startsWith(prefix) ? `${prefix}：${item}` : item));
  }

  return normalized
    .split(/\n+/)
    .map((part) => normalizeText(part).replace(/^[、;；]+|[、;；]+$/g, ""))
    .filter(Boolean);
}

function buildStructuredProjects(filePath: string) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets["公司目标"];
  if (!sheet) {
    throw new Error(`Excel 中未找到 sheet "公司目标"：${filePath}`);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];

  const projectRows = rows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(({ row }) => isCompanyGoalRow(row));

  return projectRows.map(({ row, rowNumber }, index) => {
    const serialNo = index + 1;
    const code = `FH-26-${String(serialNo).padStart(2, "0")}`;
    const tasks = extractTasks(normalizeText(row[2])).map((title, taskIndex) => ({
      sortOrder: (taskIndex + 1) * 10,
      title,
    }));

    return {
      code,
      serialNo,
      rawSeq: normalizeSeq(row[0]),
      type: "重点项目",
      name: normalizeText(row[1]),
      ownerEmployeeName: normalizeText(row[3]),
      ownerEmployeeId: null,
      tasks,
      source: {
        file: path.basename(filePath),
        sheet: "公司目标",
        rowNumber,
      },
    } satisfies StructuredProject;
  });
}

async function resolveOwners(prisma: PrismaClient, projects: StructuredProject[]) {
  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      name: true,
      employeeId: true,
      employments: {
        where: { isActive: true },
        select: { id: true },
      },
    },
  });

  const byName = new Map<string, typeof employees>();
  for (const employee of employees) {
    const list = byName.get(employee.name) ?? [];
    list.push(employee);
    byName.set(employee.name, list);
  }

  const warnings: string[] = [];
  for (const project of projects) {
    const matches = byName.get(project.ownerEmployeeName) ?? [];
    if (matches.length === 1) {
      project.ownerEmployeeId = matches[0]?.id ?? null;
      continue;
    }
    const activeOnly = matches.filter((employee) => employee.employments.length > 0);
    if (activeOnly.length === 1) {
      project.ownerEmployeeId = activeOnly[0]?.id ?? null;
      continue;
    }
    if (matches.length === 0) {
      warnings.push(`未找到员工：${project.ownerEmployeeName}（${project.code} ${project.name}）`);
    } else {
      warnings.push(`员工重名，未自动绑定：${project.ownerEmployeeName}（${project.code} ${project.name}）`);
    }
  }

  return warnings;
}

function toJson(projects: StructuredProject[]) {
  return JSON.stringify(
    projects.map((project) => ({
      code: project.code,
      serialNo: project.serialNo,
      rawSeq: project.rawSeq,
      type: project.type,
      name: project.name,
      ownerEmployeeName: project.ownerEmployeeName,
      ownerEmployeeId: project.ownerEmployeeId,
      tasks: project.tasks.map((task) => ({
        sortOrder: task.sortOrder,
        title: task.title,
      })),
      source: project.source,
    })),
    null,
    2,
  );
}

async function importProjects(prisma: PrismaClient, projects: StructuredProject[]) {
  const importedCodes: string[] = [];

  for (const project of projects) {
    const description = [
      "类型：重点项目",
      `责任人：${project.ownerEmployeeName}`,
      `原始序号：${project.rawSeq}`,
      `来源：${project.source.file} / ${project.source.sheet} / 第${project.source.rowNumber}行`,
    ].join("\n");

    const existing = await prisma.project.findFirst({
      where: { code: project.code },
      select: { id: true },
    });

    const record = existing
      ? await prisma.project.update({
        where: { id: existing.id },
        data: {
          name: project.name,
          description,
          projectLevel: "重点",
          editedAt: new Date(),
        },
        select: { id: true, code: true, name: true },
      })
      : await prisma.project.create({
        data: {
          code: project.code,
          name: project.name,
          description,
          projectLevel: "重点",
        },
        select: { id: true, code: true, name: true },
      });

    await prisma.projectTask.deleteMany({
      where: { projectId: record.id },
    });

    if (project.ownerEmployeeId) {
      await prisma.employeeProject.upsert({
        where: {
          employeeId_projectId: {
            employeeId: project.ownerEmployeeId,
            projectId: record.id,
          },
        },
        update: {
          role: "负责人",
          editedAt: new Date(),
        },
        create: {
          employeeId: project.ownerEmployeeId,
          projectId: record.id,
          role: "负责人",
        },
      });
    }

    for (const task of project.tasks) {
      await prisma.projectTask.create({
        data: {
          projectId: record.id,
          name: task.title,
          description: `来源项目：${project.code} ${project.name}`,
          ownerEmployeeId: project.ownerEmployeeId,
          sortOrder: task.sortOrder,
        },
      });
    }

    importedCodes.push(project.code);
  }

  return importedCodes;
}

async function confirmImport(prisma: PrismaClient, importedCodes: string[]) {
  const rows = await prisma.project.findMany({
    where: { code: { in: importedCodes } },
    orderBy: { code: "asc" },
    include: {
      tasks: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          owner: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    projectLevel: row.projectLevel,
    taskCount: row.tasks.length,
    taskPreview: row.tasks.slice(0, 3).map((task) => ({
      id: task.id,
      name: task.name,
      ownerEmployeeName: task.owner?.name ?? null,
    })),
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dbPath = requireDatabasePath();
  const adapter = new PrismaBetterSqlite3({ url: dbPath });
  const prisma = new PrismaClient({ adapter });

  try {
    const projects = buildStructuredProjects(options.file);
    const warnings = await resolveOwners(prisma, projects);

    await fs.mkdir(path.dirname(options.jsonOut), { recursive: true });
    await fs.writeFile(options.jsonOut, toJson(projects), "utf8");

    console.log(`已生成结构化 JSON：${options.jsonOut}`);
    console.log(`项目数：${projects.length}`);
    console.log(`任务数：${projects.reduce((sum, project) => sum + project.tasks.length, 0)}`);

    if (warnings.length > 0) {
      console.log("\n负责人解析提醒：");
      for (const warning of warnings) console.log(`- ${warning}`);
    }

    if (!options.execute) {
      console.log("\n当前为 dry-run，未写入数据库。加 --execute 才会导入本地 DB。");
      return;
    }

    const importedCodes = await importProjects(prisma, projects);
    const confirmation = await confirmImport(prisma, importedCodes);

    console.log("\n本地 DB 导入完成，确认结果：");
    for (const row of confirmation) {
      console.log(`- ${row.code} ${row.name} | 级别=${row.projectLevel} | 子任务=${row.taskCount}`);
      for (const task of row.taskPreview) {
        console.log(`  · task#${task.id} ${task.name} | 负责人=${task.ownerEmployeeName ?? "未绑定"}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
