import assert from "node:assert/strict";
import test from "node:test";

import { selectSubmittedStatementWorkpaper } from "./workpaper-source";

test("selects only submitted statement workpapers", () => {
  const submitted = { id: 1, status: "submitted", lines: [{ lineCode: "revenue" }] };
  assert.equal(selectSubmittedStatementWorkpaper(submitted), submitted);
  assert.equal(selectSubmittedStatementWorkpaper({ id: 2, status: "draft" }), null);
  assert.equal(selectSubmittedStatementWorkpaper({ id: 3, status: "reviewing" }), null);
  assert.equal(selectSubmittedStatementWorkpaper(null), null);
});
