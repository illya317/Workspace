import assert from "node:assert/strict";
import test from "node:test";

import { getActionContractMetadata } from "../../action-contract-registry";
import {
  APPROVAL_REQUEST_STATUSES,
  APPROVAL_REQUEST_TRANSITIONS,
  getApprovalRequestEventLabel,
  parseApprovalRequestStatusList,
} from "../../workflow-request-contract";
import { describeApprovalRequestFromContract } from "./contract-description";

test("department approval descriptions come from the ActionContract display metadata", () => {
  const description = describeApprovalRequestFromContract({
    id: 42,
    businessActionKey: "hr.roster.department.create",
    subjectId: null,
    committedEntityId: null,
    latestPayload: {
      entityType: "department",
      departmentId: null,
      data: { code: "CHM300", name: "测试部门" },
    },
  });

  assert.deepEqual(description, {
    title: "创建部门：测试部门",
    summary: "CHM300 · 测试部门",
    href: "/hr/roster?tab=department-position&workflowRequestId=42",
  });
});

test("department ActionContracts use the canonical ApprovalRequest lifecycle", () => {
  for (const key of ["hr.roster.department.create", "hr.roster.department.update"]) {
    const contract = getActionContractMetadata(key);
    assert.ok(contract?.workflow && contract.workflow.kind === "configurable");
    assert.deepEqual(contract.workflow.statuses, APPROVAL_REQUEST_STATUSES);
    assert.deepEqual(contract.workflow.transitions, APPROVAL_REQUEST_TRANSITIONS);
  }

  assert.deepEqual(
    parseApprovalRequestStatusList("submitted,cancelled,not-a-status"),
    ["submitted", "cancelled"],
  );
  assert.equal(getApprovalRequestEventLabel("reject"), "驳回");
});
