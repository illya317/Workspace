import assert from "node:assert/strict";
import test from "node:test";

import {
  NOTIFICATION_DEFINITION_KEY_IMMUTABLE_MESSAGE,
  validateImmutableNotificationDefinitionKey,
} from "./notification-definition-governance";

test("notification definition key remains immutable after creation", () => {
  assert.deepEqual(
    validateImmutableNotificationDefinitionKey("custom.project.deadline", "custom.project.deadline"),
    { ok: true, data: true },
  );
  assert.deepEqual(
    validateImmutableNotificationDefinitionKey("custom.project.deadline", "custom.project.renamed"),
    {
      ok: false,
      issue: {
        message: NOTIFICATION_DEFINITION_KEY_IMMUTABLE_MESSAGE,
        status: 409,
        field: "key",
      },
    },
  );
});
