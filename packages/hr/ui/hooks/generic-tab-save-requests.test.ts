import assert from "node:assert/strict";
import test from "node:test";

import { buildGenericTabSaveRequests } from "./generic-tab-save-requests";

const changes = [
  { id: 4, field: "shareRatio", value: 0.75, expectedVersion: 2 },
  { id: 5, field: "effectiveTo", value: "2026-12-31", expectedVersion: 3 },
];

test("keeps the collection page-draft adapter as the default", () => {
  assert.deepEqual(
    buildGenericTabSaveRequests({ apiPath: "/api/modules/hr/roster/employees" }, changes),
    [{ path: "/api/modules/hr/roster/employees", body: { changes } }],
  );
});

test("keeps a configured row delete path out of the atomic page-draft save", () => {
  assert.deepEqual(
    buildGenericTabSaveRequests({
      apiPath: "/api/modules/test/records",
      rowPath: (id) => `/api/modules/test/records/${id}`,
    }, changes),
    [{ path: "/api/modules/test/records", body: { changes } }],
  );
});
