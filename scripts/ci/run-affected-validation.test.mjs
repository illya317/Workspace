import assert from "node:assert/strict";
import test from "node:test";

import {
  runCommandGroups,
  selectedCommandGroups,
  selectedCommands,
} from "./run-affected-validation.mjs";

test("affected validation selects only lanes declared by the base/head plan", () => {
  const classification = {
    riskClass: "C2",
    runStatic: true,
    runNode: true,
    runType: true,
    runPostgresql: false,
    runE2e: true,
  };
  assert.deepEqual(selectedCommands(classification, "source"), [
    ["npm", ["run", "db:generate"]],
    ["npm", ["run", "lint:changed"]],
    ["npm", ["run", "domain:changed"]],
    ["npm", ["run", "db:migration:changed"]],
    ["npm", ["run", "test:node:affected"]],
    ["npm", ["run", "typecheck:affected"]],
  ]);
  assert.deepEqual(selectedCommands(classification, "post-build"), [
    ["bash", ["./ops/run-release-e2e.sh"]],
  ]);
  assert.deepEqual(selectedCommands(classification, "post-build", { deployUnitId: "finance" }), []);
});

test("documentation-only validation does not install or run code gates", () => {
  assert.deepEqual(selectedCommands({ riskClass: "C0", runStatic: true }, "source"), [
    ["node", ["scripts/check/check-architecture-docs.js"]],
  ]);
});

test("C3 validation runs the complete source CI once and leaves artifact build to the artifact phase", () => {
  const commands = selectedCommands({
    riskClass: "C3",
    runStatic: true,
    runNode: true,
    runType: true,
    runPostgresql: true,
    runE2e: true,
  }, "source");

  assert.deepEqual(commands, [
    ["node", [
      "scripts/check/with-check-lock.js",
      "--",
      "node",
      "scripts/check/run-check-suite.mjs",
      "release-source",
    ]],
    ["npx", ["prisma", "migrate", "deploy", "--schema=./prisma"]],
    ["npm", ["run", "db:seed:resources"]],
    ["npm", ["run", "test:integration:postgresql"]],
  ]);
});

test("affected validation reports every independent failure and blocks only dependent followers", () => {
  const classification = {
    riskClass: "C2",
    runStatic: true,
    runNode: true,
    runType: true,
    runPostgresql: true,
    runE2e: false,
  };
  const calls = [];
  const output = [];
  const result = runCommandGroups(selectedCommandGroups(classification, "source"), {}, {
    execute(command, args) {
      const label = `${command} ${args.join(" ")}`;
      calls.push(label);
      if (label === "npm run lint:changed") return { status: 7 };
      if (label.startsWith("npx prisma migrate deploy")) return { status: 9 };
      return { status: 0 };
    },
    stdout: { write(value) { output.push(value); } },
    stderr: { write(value) { output.push(value); } },
  });

  assert.equal(result.status, 7);
  assert.deepEqual(result.failed.map((failure) => failure.command), [
    "npm run lint:changed",
    "npx prisma migrate deploy --schema=./prisma",
  ]);
  assert.deepEqual(result.blocked.map((item) => item.command), [
    "npm run db:seed:resources",
    "npm run test:integration:postgresql",
  ]);
  assert.ok(calls.includes("npm run test:node:affected"));
  assert.ok(calls.includes("npm run typecheck:affected"));
  assert.ok(calls.includes("npm run check:data"));
  assert.equal(calls.includes("npm run db:seed:resources"), false);
  assert.match(output.join(""), /failed: 2/);
  assert.match(output.join(""), /blocked: 2/);
});

test("database startup failure blocks only its dependency chain", () => {
  const classification = {
    riskClass: "C2",
    runStatic: false,
    runNode: true,
    runType: true,
    runPostgresql: true,
    runE2e: false,
  };
  const groups = selectedCommandGroups(classification, "source");
  groups.find((group) => group.id === "postgresql-runtime").preconditionFailure = {
    command: "start disposable PostgreSQL",
    status: 17,
  };
  const calls = [];
  const result = runCommandGroups(groups, {}, {
    execute(command, args) {
      calls.push(`${command} ${args.join(" ")}`);
      return { status: 0 };
    },
    stdout: { write() {} },
    stderr: { write() {} },
  });

  assert.equal(result.status, 17);
  assert.deepEqual(result.failed.map((failure) => failure.command), ["start disposable PostgreSQL"]);
  assert.deepEqual(result.blocked.map((item) => item.command), [
    "npx prisma migrate deploy --schema=./prisma",
    "npm run db:seed:resources",
    "npm run test:integration:postgresql",
  ]);
  assert.ok(calls.includes("npm run test:node:affected"));
  assert.ok(calls.includes("npm run typecheck:affected"));
  assert.ok(calls.includes("npm run check:data"));
  assert.equal(calls.some((call) => call.includes("prisma migrate")), false);
});
