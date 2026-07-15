import assert from "node:assert/strict";
import test from "node:test";

import { assertBusinessActionRegistryValid } from "../../packages/platform/business-action-registry-validation";

test("workflow registration rejects a space-derived business action identity", () => {
  assert.throws(
    () => assertBusinessActionRegistryValid([{
      key: "space.department.tasks.example.submit",
      eligibility: "workflow_optional",
      flowType: "approval",
      separationPolicy: "auto_pass_if_authorized",
      workflowCategoryKey: "assessment",
    }]),
    /must use a base businessActionKey/,
  );
});
