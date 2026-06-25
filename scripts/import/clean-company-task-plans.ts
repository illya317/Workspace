import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

type GroupedSubTask = {
  index: number;
  title: string;
};

type GroupedTask = {
  month: string;
  monthOrder: number;
  sourceFile: string;
  sourceSheet: string;
  sourceRowNumber: number;
  rawSeq: string;
  normalizedSeq: number;
  taskName: string;
  ownerEmployeeName: string;
  subTasks: GroupedSubTask[];
};

type FlatTask = {
  month: string;
  monthOrder: number;
  sourceFile: string;
  rawSeq: string;
  normalizedSeq: number;
  taskName: string;
  ownerEmployeeName: string;
  subTaskIndex: number;
  subTaskTitle: string;
};

function requireEnvDir(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`缺少环境变量 ${key}，请设置为公司重点工作计划 Excel 所在的本地目录。`);
  }
  return value;
}

const INPUT_DIR = requireEnvDir("COMPANY_TASK_PLANS_INPUT_DIR");
const OUTPUT_DIR = requireEnvDir("COMPANY_TASK_PLANS_OUTPUT_DIR");
const GROUPED_OUT = path.join(OUTPUT_DIR, "公司重点工作计划_2026H1_grouped.json");
const FLAT_OUT = path.join(OUTPUT_DIR, "公司重点工作计划_2026H1_flat.json");

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

function parseMonthOrder(fileName: string) {
  const match = fileName.match(/公司(\d+)月份重点工作计划/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]);
}

function parseMonthLabel(fileName: string) {
  const match = fileName.match(/公司(\d+)月份重点工作计划/);
  if (!match) return fileName;
  return `${match[1]}月`;
}

function isCompanyGoalRow(row: unknown[]) {
  const seq = normalizeSeq(row[0]);
  const taskName = normalizeText(row[1]);
  const taskText = normalizeText(row[2]);
  if (!seq || !taskName || !taskText) return false;
  if (seq === "序号" || seq === "合计") return false;
  return true;
}

function splitBySemicolon(text: string) {
  return text
    .split(/[；;]\s*/g)
    .map((part) => normalizeText(part).replace(/[，,、；;。.\s]+$/g, ""))
    .filter(Boolean);
}

function extractSubTasks(text: string) {
  const normalized = normalizeText(text)
    .replace(/([：:；;])\s*(\d+\s*[、.）)])/g, "$1\n$2")
    .replace(/\s{2,}(\d+\s*[、.）)])/g, "\n$1")
    .replace(/([^\n])\s+(\d+\s*[、.）)])/g, "$1\n$2")
    .replace(/([，,])\s*(\d+\s*[、.）)])/g, "$1\n$2");
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
      .map((match) => normalizeText(match[2]).replace(/[，,、；;。.\s]+$/g, ""))
      .filter(Boolean)
      .map((item) => (prefix && !item.startsWith(prefix) ? `${prefix}：${item}` : item));
  }

  const semiSplit = splitBySemicolon(normalized);
  if (semiSplit.length > 1) return semiSplit;

  return normalized
    .split(/\n+/)
    .map((part) => normalizeText(part).replace(/^[、;；]+|[，,、；;。.\s]+$/g, ""))
    .filter(Boolean);
}

async function buildData() {
  const names = (await fs.readdir(INPUT_DIR))
    .filter((name) => name.endsWith(".xlsx") && name.startsWith("公司"))
    .sort((a, b) => parseMonthOrder(a) - parseMonthOrder(b));

  const grouped: GroupedTask[] = [];
  const flat: FlatTask[] = [];

  for (const name of names) {
    const filePath = path.join(INPUT_DIR, name);
    const workbook = XLSX.readFile(filePath, { raw: false });
    const sheet = workbook.Sheets["公司目标"];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    }) as unknown[][];

    const monthOrder = parseMonthOrder(name);
    const month = parseMonthLabel(name);
    let seqCounter = 1;

    rows.forEach((row, index) => {
      if (!isCompanyGoalRow(row)) return;

      const taskName = normalizeText(row[1]);
      const ownerEmployeeName = normalizeText(row[3]);
      const subTaskTitles = extractSubTasks(normalizeText(row[2]));

      const groupedTask: GroupedTask = {
        month,
        monthOrder,
        sourceFile: name,
        sourceSheet: "公司目标",
        sourceRowNumber: index + 1,
        rawSeq: normalizeSeq(row[0]),
        normalizedSeq: seqCounter,
        taskName,
        ownerEmployeeName,
        subTasks: subTaskTitles.map((title, subIndex) => ({
          index: subIndex + 1,
          title,
        })),
      };

      grouped.push(groupedTask);

      groupedTask.subTasks.forEach((subTask) => {
        flat.push({
          month,
          monthOrder,
          sourceFile: name,
          rawSeq: groupedTask.rawSeq,
          normalizedSeq: groupedTask.normalizedSeq,
          taskName,
          ownerEmployeeName,
          subTaskIndex: subTask.index,
          subTaskTitle: subTask.title,
        });
      });

      seqCounter += 1;
    });
  }

  return { grouped, flat };
}

async function main() {
  const data = await buildData();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(GROUPED_OUT, JSON.stringify(data.grouped, null, 2), "utf8");
  await fs.writeFile(FLAT_OUT, JSON.stringify(data.flat, null, 2), "utf8");

  const months = [...new Set(data.grouped.map((item) => item.month))];
  console.log(`已输出 grouped JSON: ${GROUPED_OUT}`);
  console.log(`已输出 flat JSON: ${FLAT_OUT}`);
  console.log(`月份数: ${months.length}`);
  console.log(`重点工作数: ${data.grouped.length}`);
  console.log(`子任务数: ${data.flat.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
