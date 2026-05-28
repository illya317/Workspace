const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

let exitCode = 0;
function fail(msg) {
  console.error("✗ " + msg);
  exitCode = 1;
}
function warn(msg) {
  console.warn("⚠ " + msg);
}
function ok(msg) {
  console.log("✓ " + msg);
}

// ─── 规则 1: schema.prisma 中不得出现 model ─────────────────────
const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");
const schemaContent = fs.readFileSync(schemaPath, "utf-8");
if (/^model\s+/m.test(schemaContent)) {
  fail("prisma/schema.prisma 中包含 model 定义，只允许放 generator 和 datasource");
} else {
  ok("prisma/schema.prisma 无 model 定义");
}

// ─── 规则 2 & 3: model 文件检查 ──────────────────────────────────
const modelsDir = path.join(__dirname, "..", "prisma", "models");
const modelFiles = fs.readdirSync(modelsDir).filter((f) => f.endsWith(".prisma"));

for (const file of modelFiles) {
  const filePath = path.join(modelsDir, file);
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");

  // 规则 3: 行数检查
  const nonEmptyLines = lines.filter((l) => l.trim() !== "").length;
  if (nonEmptyLines > 350) {
    fail(`${file} 超过 350 行（实际 ${nonEmptyLines} 行）`);
  } else if (nonEmptyLines > 260) {
    warn(`${file} 超过 260 行（实际 ${nonEmptyLines} 行），建议拆分`);
  }

  // 规则 2: 每个 model 前一行非空内容必须是 ///
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^model\s+(\w+)/);
    if (!match) continue;

    // 向前找非空行
    let j = i - 1;
    while (j >= 0 && lines[j].trim() === "") j--;
    const prev = j >= 0 ? lines[j].trim() : "";
    if (!prev.startsWith("///")) {
      fail(`${file}:${i + 1} model ${match[1]} 前缺少 /// 注释`);
    }
  }
}

ok("model 文件结构和注释检查完成");

// ─── 规则 4: finance-cost.prisma 禁止派生字段名 ──────────────────
const financeCostPath = path.join(modelsDir, "finance-cost.prisma");
if (fs.existsSync(financeCostPath)) {
  const forbidden = [
    "total",
    "subtotal",
    "ratio",
    "rate",
    "percent",
    "percentage",
    "share",
    "unitCost",
    "grossProfit",
    "margin",
    "unreceivedAmount",
    "remainingAmount",
  ];
  const content = fs.readFileSync(financeCostPath, "utf-8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // 只检查字段定义行（以空格开头，包含字段名和类型）
    if (!/^\s+\w+\s+\w+/.test(line)) continue;
    const fieldMatch = line.match(/^\s+(\w+)\s+/);
    if (!fieldMatch) continue;
    const fieldName = fieldMatch[1];
    if (forbidden.includes(fieldName)) {
      fail(`finance-cost.prisma:${i + 1} 禁止派生字段名 "${fieldName}"`);
    }
  }
  ok("finance-cost.prisma 无禁止派生字段名");
}

// ─── 规则 5: finance-cost 事实模型必须含 source 字段 ─────────────
if (fs.existsSync(financeCostPath)) {
  const content = fs.readFileSync(financeCostPath, "utf-8");
  // 简单检查：文件中必须同时出现这三个字段名
  const hasSourceFile = /\bsourceFile\b/.test(content);
  const hasSourceSheet = /\bsourceSheet\b/.test(content);
  const hasSourceRow = /\bsourceRow\b/.test(content);
  if (!hasSourceFile || !hasSourceSheet || !hasSourceRow) {
    fail("finance-cost.prisma 必须包含 sourceFile、sourceSheet、sourceRow 字段");
  } else {
    ok("finance-cost.prisma 包含必要的 source 追溯字段");
  }
}

// ─── 规则 6 & 7: staged files 检查 ──────────────────────────────
let stagedFiles = [];
try {
  const output = execSync("git diff --cached --name-only", { encoding: "utf-8", cwd: path.join(__dirname, "..") });
  stagedFiles = output.trim().split("\n").filter(Boolean);
} catch {
  // 不在 git repo 中或无 staged files
}

if (stagedFiles.length > 0) {
  const hasFinanceCostModel = stagedFiles.some((f) => f === "prisma/models/finance-cost.prisma");
  if (hasFinanceCostModel) {
    const hasFinanceCostArch = stagedFiles.some((f) => f === "app/finance/cost/ARCHITECTURE.md");
    const archTracked =
      !hasFinanceCostArch &&
      (() => {
        try {
          execSync("git ls-files --error-unmatch app/finance/cost/ARCHITECTURE.md", {
            encoding: "utf-8",
            cwd: path.join(__dirname, ".."),
            stdio: "pipe",
          });
          return true;
        } catch {
          return false;
        }
      })();
    if (!hasFinanceCostArch && !archTracked) {
      fail("修改 prisma/models/finance-cost.prisma 时，必须同时提交 app/finance/cost/ARCHITECTURE.md");
    }
  }

  const hasAnyModelFile = stagedFiles.some((f) => f.startsWith("prisma/models/") && f.endsWith(".prisma"));
  if (hasAnyModelFile) {
    const archExists = fs.existsSync(path.join(__dirname, "..", "docs", "schema-governance.md"));
    if (!archExists) {
      fail("修改 prisma model 文件时，docs/schema-governance.md 必须存在");
    } else {
      ok("docs/schema-governance.md 存在");
    }
  }
}

process.exit(exitCode);
