import assert from "node:assert/strict";
import test from "node:test";

import { parseLibraryPreviewRange } from "./preview-range";

test("parseLibraryPreviewRange accepts full, bounded and suffix ranges", () => {
  assert.deepEqual(parseLibraryPreviewRange(null, 1000), { ok: true, range: null });
  assert.deepEqual(parseLibraryPreviewRange("bytes=100-199", 1000), {
    ok: true,
    range: { start: 100, end: 199 },
  });
  assert.deepEqual(parseLibraryPreviewRange("bytes=900-", 1000), {
    ok: true,
    range: { start: 900, end: 999 },
  });
  assert.deepEqual(parseLibraryPreviewRange("bytes=-250", 1000), {
    ok: true,
    range: { start: 750, end: 999 },
  });
});

test("parseLibraryPreviewRange rejects unsupported and unsatisfied ranges", () => {
  assert.deepEqual(parseLibraryPreviewRange("bytes=0-1,4-5", 1000), { ok: false });
  assert.deepEqual(parseLibraryPreviewRange("bytes=1000-", 1000), { ok: false });
  assert.deepEqual(parseLibraryPreviewRange("items=0-10", 1000), { ok: false });
});
