import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePositionReportOverrideRows,
  type PlacementRow,
} from "./PositionReportOverridePersistence";

test("existing special reporting rows preserve id and version in the save payload", () => {
  const row: PlacementRow = {
    clientKey: "41",
    id: 41,
    version: 7,
    companyId: 2,
    companyName: "公司",
    departmentId: 3,
    departmentPath: "组织",
    reportToPositionId: 9,
    reportToPositionName: "负责人",
    headcount: "4",
    isActive: true,
    edpCount: 1,
  };
  assert.deepEqual(normalizePositionReportOverrideRows([row]), [{
    id: 41,
    version: 7,
    companyId: 2,
    departmentId: 3,
    reportToPositionId: 9,
    headcount: 4,
    isActive: true,
  }]);
});
