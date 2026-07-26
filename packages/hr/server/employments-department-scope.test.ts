import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { workspaceBusinessDate } from "@workspace/platform/server/business-date";

import {
  buildCurrentEmploymentDepartmentScopeWhere,
  buildEmploymentDepartmentScopeWhere,
} from "./employment-scope";

process.env.WORKSPACE_CONFIG_DIR = path.resolve("scripts/check/fixtures/tenant-workspace");

test("legacy department employment scope keeps matching any historical or current assignment", () => {
  assert.deepEqual(buildEmploymentDepartmentScopeWhere(12), {
    employee: {
      positions: {
        some: {
          OR: [{ departmentId: 12 }, { position: { departmentId: 12 } }],
        },
      },
    },
  });
});

test("v3 department employment scope only accepts assignments effective today", () => {
  assert.deepEqual(buildCurrentEmploymentDepartmentScopeWhere(12, "2026-07-25"), {
    employee: {
      positions: {
        some: {
          AND: [
            { OR: [{ departmentId: 12 }, { position: { departmentId: 12 } }] },
            { OR: [{ startDate: null }, { startDate: "" }, { startDate: { lte: "2026-07-25" } }] },
            { OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: "2026-07-25" } }] },
          ],
        },
      },
    },
  });
});

test("department employment scope uses the Workspace business date", () => {
  const instant = new Date("2026-07-24T16:30:00.000Z");
  const expectedDate = workspaceBusinessDate(instant);
  assert.deepEqual(
    buildCurrentEmploymentDepartmentScopeWhere(12, instant),
    buildCurrentEmploymentDepartmentScopeWhere(12, expectedDate),
  );
});
