import assert from "node:assert/strict";
import test from "node:test";

import {
  registerBusinessSpaceNaturalAccessProvider,
  resolveRegisteredBusinessSpaceNaturalActionProfile,
} from "./business-space-access-providers";

test("registered business-space provider resolves a natural action profile", async () => {
  registerBusinessSpaceNaturalAccessProvider({
    targetType: "project-test",
    resolveActionProfile: async ({ userId, targetId }) => (
      userId === 7 && targetId === 9 ? "read" : null
    ),
  });

  assert.equal(
    await resolveRegisteredBusinessSpaceNaturalActionProfile(7, "project-test", 9),
    "read",
  );
  assert.equal(
    await resolveRegisteredBusinessSpaceNaturalActionProfile(8, "project-test", 9),
    null,
  );
  assert.equal(
    await resolveRegisteredBusinessSpaceNaturalActionProfile(7, "missing-test", 9),
    null,
  );
});
