import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  findBusinessTemporalWriteViolations,
  repositorySources,
  type BusinessTemporalWriteRule,
} from "./business-temporal-write-seam";

const rule: BusinessTemporalWriteRule = {
  delegate: "employeeProject",
  model: "EmployeeProject",
  allowedFiles: ["packages/work/server/lifecycle.ts"],
};

test("write seam permits the owner command adapter and reports CRUD bypasses", () => {
  const violations = findBusinessTemporalWriteViolations(new Map([
    ["packages/work/server/lifecycle.ts", "await tx.employeeProject.create({ data });"],
    ["packages/work/server/crud.ts", "await prisma.employeeProject.update({ where, data });\nawait tx.employeeProject.deleteMany({ where });"],
    ["packages/work/server/read.ts", "await prisma.employeeProject.findMany({ where });"],
  ]), [rule]);
  assert.deepEqual(violations, [{
    model: "EmployeeProject",
    file: "packages/work/server/crud.ts",
    line: 1,
    method: "update",
  }, {
    model: "EmployeeProject",
    file: "packages/work/server/crud.ts",
    line: 2,
    method: "deleteMany",
  }]);
});

test("write seam can retire a legacy dual-truth delegate completely", () => {
  const violations = findBusinessTemporalWriteViolations(new Map([
    ["packages/hr/server/departments.ts", "await tx.departmentManagerEmployee.createMany({ data });"],
    ["scripts/check/preflight.ts", "await prisma.departmentManagerEmployee.findMany();"],
  ]), [{
    delegate: "departmentManagerEmployee",
    model: "DepartmentManagerEmployee",
    allowedFiles: [],
  }]);
  assert.deepEqual(violations, [{
    model: "DepartmentManagerEmployee",
    file: "packages/hr/server/departments.ts",
    line: 1,
    method: "createMany",
  }]);
});

test("repository source discovery falls back to a gitignore-aware listing only when rg is unavailable", () => {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "business-temporal-source-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: repositoryRoot, stdio: "pipe" });
    fs.mkdirSync(path.join(repositoryRoot, "packages/work/generated"), { recursive: true });
    fs.mkdirSync(path.join(repositoryRoot, "packages/work/.cache"), { recursive: true });
    fs.mkdirSync(path.join(repositoryRoot, "app/api"), { recursive: true });
    fs.mkdirSync(path.join(repositoryRoot, "scripts/check"), { recursive: true });
    fs.writeFileSync(path.join(repositoryRoot, ".gitignore"), "packages/work/ignored.ts\npackages/work/.cache/\n");
    fs.writeFileSync(path.join(repositoryRoot, "packages/work/generated/runtime.ts"), "export const runtime = true;\n");
    fs.writeFileSync(path.join(repositoryRoot, "packages/work/ignored.ts"), "throw new Error('ignored');\n");
    fs.writeFileSync(path.join(repositoryRoot, "packages/work/.cache/stale.ts"), "throw new Error('cache');\n");
    fs.writeFileSync(path.join(repositoryRoot, "app/api/route.tsx"), "export default function Route() { return null; }\n");
    fs.writeFileSync(path.join(repositoryRoot, "scripts/check/runtime.test.ts"), "throw new Error('test only');\n");
    fs.writeFileSync(path.join(repositoryRoot, "scripts/check/ignored.js"), "module.exports = {};\n");
    fs.writeFileSync(path.join(repositoryRoot, "packages/work/deleted.ts"), "export const deleted = true;\n");
    execFileSync("git", ["add", "packages/work/deleted.ts"], { cwd: repositoryRoot, stdio: "pipe" });
    fs.unlinkSync(path.join(repositoryRoot, "packages/work/deleted.ts"));

    const missingRg = Object.assign(new Error("spawn rg ENOENT"), { code: "ENOENT" });
    const sources = repositorySources(repositoryRoot, () => { throw missingRg; });
    assert.deepEqual([...sources.keys()], [
      "app/api/route.tsx",
      "packages/work/generated/runtime.ts",
    ]);
  } finally {
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test("repository source discovery does not hide rg or git listing failures", () => {
  const rgFailure = Object.assign(new Error("rg permission denied"), { code: "EACCES" });
  assert.throws(
    () => repositorySources(process.cwd(), () => { throw rgFailure; }),
    (error: unknown) => error === rgFailure,
  );

  const missingRg = Object.assign(new Error("spawn rg ENOENT"), { code: "ENOENT" });
  const gitFailure = Object.assign(new Error("git listing failed"), { code: "EACCES" });
  assert.throws(
    () => repositorySources(
      process.cwd(),
      () => { throw missingRg; },
      () => { throw gitFailure; },
    ),
    (error: unknown) => error === gitFailure,
  );
});
