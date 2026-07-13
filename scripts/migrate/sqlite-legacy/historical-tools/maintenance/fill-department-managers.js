#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { requireDatabasePath } = require("../lib/database-url");

const STRONG_TITLES = [
  ["董事长", 98],
  ["执行总裁", 94],
  ["总裁", 90],
  ["部长", 88],
  ["总经理", 86],
  ["经理", 78],
  ["主任", 76],
  ["总监", 72],
  ["负责人", 70],
];

const EXACT_TITLE_SUFFIXES = ["部长", "经理", "主任", "总监"];
const GENERIC_ROLE_PENALTIES = ["专员", "管理员", "检验员"];

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function isoTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function activeEmployeeNames(position) {
  return (position.employeeNames || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

function scoreCandidate(department, position) {
  const departmentName = department.name || "";
  const positionName = position.positionName || "";
  let score = 0;
  const reasons = [];

  if (departmentName && positionName.includes(departmentName)) {
    score += 25;
    reasons.push("position contains department name");
  }

  for (const [title, value] of STRONG_TITLES) {
    if (positionName.includes(title)) {
      score += value;
      reasons.push(title);
      break;
    }
  }

  if (EXACT_TITLE_SUFFIXES.some((suffix) => positionName === `${departmentName}${suffix}`)) {
    score += 20;
    reasons.push("exact department title");
  }

  if (position.primaryAssignments > 0) {
    score += 6;
    reasons.push("has primary assignee");
  }

  if (position.scopeRank > 0) {
    score -= position.scopeRank * 18;
    reasons.push(`related department penalty ${position.scopeRank}`);
  }

  if (positionName.includes("副")) {
    score -= 12;
    reasons.push("deputy penalty");
  }

  if (GENERIC_ROLE_PENALTIES.some((word) => positionName.includes(word)) || positionName === "销售经理") {
    score -= 20;
    reasons.push("generic role penalty");
  }

  return { score, reason: reasons.join("; ") };
}

function candidateSort(left, right) {
  return (
    right.score - left.score ||
    right.row.primaryAssignments - left.row.primaryAssignments ||
    left.row.positionId - right.row.positionId
  );
}

function selectCandidate(department, rows, minScore) {
  const candidates = rows
    .map((row) => {
      const scored = scoreCandidate(department, row);
      return { ...scored, row };
    })
    .filter((candidate) => candidate.score >= minScore)
    .sort(candidateSort);
  return candidates[0] || null;
}

function maybeQualityFallback(department, rows) {
  if (department.code !== "FUN700" && department.name !== "质量部") return null;
  const candidates = rows
    .filter((row) => row.positionName === "质量受权人" || row.positionName.includes("药物警戒负责人"))
    .map((row) => ({ score: 64, reason: "quality department fallback", row }))
    .sort(candidateSort);
  return candidates[0] || null;
}

function groupByDepartment(rows) {
  const byDepartment = new Map();
  for (const row of rows) {
    if (!byDepartment.has(row.departmentId)) byDepartment.set(row.departmentId, []);
    byDepartment.get(row.departmentId).push(row);
  }
  return byDepartment;
}

function buildDepartmentScopes(departments) {
  const byId = new Map(departments.map((department) => [department.id, department]));
  const childrenByParentId = new Map();
  for (const department of departments) {
    if (!department.parentId) continue;
    const children = childrenByParentId.get(department.parentId) || [];
    children.push(department.id);
    childrenByParentId.set(department.parentId, children);
  }
  const scopes = new Map();
  for (const department of departments) {
    const ids = [department.id];
    let parent = department.parentId ? byId.get(department.parentId) : null;
    while (parent) {
      ids.push(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : null;
    }

    const queue = [...(childrenByParentId.get(department.id) || [])];
    while (queue.length > 0) {
      const childId = queue.shift();
      if (!childId || ids.includes(childId)) continue;
      ids.push(childId);
      queue.push(...(childrenByParentId.get(childId) || []));
    }

    scopes.set(department.id, ids);
  }
  return scopes;
}

function scopedRowsForDepartment(rowsByDepartment, scopeDepartmentIds) {
  return scopeDepartmentIds.flatMap((scopeDepartmentId, scopeRank) =>
    (rowsByDepartment.get(scopeDepartmentId) || []).map((row) => ({
      ...row,
      scopeRank,
    })),
  );
}

function createBackup(dbPath) {
  const backupPath = `${dbPath}.before-department-manager-positions-${isoTimestamp()}`;
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function printTable(title, rows) {
  console.log(`\n${title}`);
  if (rows.length === 0) {
    console.log("(none)");
    return;
  }
  console.table(rows);
}

function assertManagerPositionColumn(db) {
  const columns = db.prepare("PRAGMA table_info('Department')").all();
  if (!columns.some((column) => column.name === "managerPositionId")) {
    throw new Error("Department.managerPositionId column is missing. Run the latest Prisma migration first.");
  }
}

function main() {
  loadEnv();

  const apply = hasArg("--apply");
  const overwrite = hasArg("--overwrite");
  const noBackup = hasArg("--no-backup");
  const minScore = Number(argValue("--min-score", "65"));
  const today = argValue("--today", new Date().toISOString().slice(0, 10));
  const editedByRaw = argValue("--edited-by", "");
  const editedBy = editedByRaw ? Number(editedByRaw) : null;
  if (!Number.isFinite(minScore)) throw new Error("--min-score must be a number");
  if (editedByRaw && (!Number.isInteger(editedBy) || editedBy <= 0)) throw new Error("--edited-by must be a positive integer");

  const dbPath = requireDatabasePath();
  const db = new Database(dbPath);
  assertManagerPositionColumn(db);

  const departments = db.prepare(`
    SELECT id, code, name, level, parentId, managerPositionId
    FROM Department
    WHERE isArchived = 0
    ORDER BY level, code, id
  `).all();

  const positions = db.prepare(`
    SELECT
      d.id AS departmentId,
      p.id AS positionId,
      p.name AS positionName,
      p.code AS positionCode,
      d.name AS sourceDepartment,
      SUM(CASE WHEN ep.isPrimary THEN 1 ELSE 0 END) AS primaryAssignments,
      COUNT(DISTINCT e.id) AS activeEmployees,
      GROUP_CONCAT(DISTINCT e.name) AS employeeNames
    FROM Department d
    JOIN Position p ON p.departmentId = d.id AND p.isArchived = 0
    JOIN EmployeePosition ep ON ep.positionId = p.id
    JOIN Employee e ON e.id = ep.employeeId
    JOIN Employment em ON em.employeeId = e.id AND em.isActive = 1
    WHERE d.isArchived = 0
      AND (ep.endDate IS NULL OR ep.endDate = '' OR ep.endDate >= @today)
    GROUP BY d.id, p.id
    ORDER BY d.id, p.id
  `).all({ today });

  const rowsByDepartment = groupByDepartment(positions);
  const scopeDepartmentIdsByDepartment = buildDepartmentScopes(departments);
  const planned = [];
  const unresolved = [];

  for (const department of departments) {
    if (department.managerPositionId != null && !overwrite) continue;
    const rows = scopedRowsForDepartment(
      rowsByDepartment,
      scopeDepartmentIdsByDepartment.get(department.id) || [department.id],
    );
    const candidate = selectCandidate(department, rows, minScore) || maybeQualityFallback(department, rows);
    if (!candidate) {
      unresolved.push({
        id: department.id,
        code: department.code,
        department: department.name,
        currentManagerPositionId: department.managerPositionId,
      });
      continue;
    }
    planned.push({
      departmentId: department.id,
      code: department.code,
      department: department.name,
      currentManagerPositionId: department.managerPositionId,
      managerPositionId: candidate.row.positionId,
      managerPosition: candidate.row.positionName,
      sourceDepartment: candidate.row.sourceDepartment,
      activeEmployees: activeEmployeeNames(candidate.row).join("、"),
      score: candidate.score,
      reason: candidate.reason,
    });
  }

  printTable(apply ? "Applying department manager position candidates" : "Dry-run department manager position candidates", planned);
  printTable("Unresolved active departments", unresolved);

  console.log(`\nDatabase: ${dbPath}`);
  console.log(`Mode: ${apply ? "apply" : "dry-run"}${overwrite ? " + overwrite" : ""}`);
  console.log(`Candidates: ${planned.length}; unresolved: ${unresolved.length}`);

  if (apply && planned.length > 0) {
    const backupPath = noBackup ? null : createBackup(dbPath);
    if (backupPath) console.log(`Backup: ${backupPath}`);

    const update = db.prepare(`
      UPDATE Department
      SET
        managerPositionId = @managerPositionId,
        editedBy = COALESCE(@editedBy, editedBy),
        editedAt = CURRENT_TIMESTAMP,
        version = version + 1
      WHERE id = @departmentId
        ${overwrite ? "" : "AND managerPositionId IS NULL"}
    `);

    const run = db.transaction((items) => {
      for (const item of items) {
        update.run({
          departmentId: item.departmentId,
          managerPositionId: item.managerPositionId,
          editedBy,
        });
      }
    });
    run(planned);
    console.log(`Updated departments: ${planned.length}`);
  }
}

main();
