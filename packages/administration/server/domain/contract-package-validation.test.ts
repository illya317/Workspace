import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTRACT_ATTACHMENT_MAX_BYTES,
  buildContractApprovalReferenceCommand,
  buildContractAttachmentUploadCommand,
  buildContractRecordCreateCommand,
} from "./contract-package-validation";

test("contract attachment validation accepts supported archive files and normalizes facts", () => {
  const file = new File(["signed contract"], "签署合同.pdf", { type: "application/pdf" });
  const command = buildContractAttachmentUploadCommand(17, {
    file,
    kind: "signed_contract",
    note: "  盖章原件  ",
  }, 23);

  assert.equal(command.ok, true);
  if (!command.ok) return;
  assert.equal(command.data.fileName, "签署合同.pdf");
  assert.equal(command.data.mimeType, "application/pdf");
  assert.equal(command.data.note, "盖章原件");
});

test("contract attachment validation rejects unsafe, unsupported and oversized files", () => {
  const unsafe = buildContractAttachmentUploadCommand(17, {
    file: new File(["x"], "../contract.pdf", { type: "application/pdf" }),
    kind: "other",
  }, 23);
  const unsupported = buildContractAttachmentUploadCommand(17, {
    file: new File(["x"], "contract.exe"),
    kind: "other",
  }, 23);
  const oversizedFile = new File(["x"], "contract.pdf");
  Object.defineProperty(oversizedFile, "size", { value: CONTRACT_ATTACHMENT_MAX_BYTES + 1 });
  const oversized = buildContractAttachmentUploadCommand(17, {
    file: oversizedFile,
    kind: "other",
  }, 23);

  assert.equal(unsafe.ok, false);
  assert.equal(unsupported.ok, false);
  assert.equal(oversized.ok, false);
});

test("contract records and approval references validate dates, versions and source keys", () => {
  const record = buildContractRecordCreateCommand(17, {
    recordType: "filing",
    occurredOn: "2026-07-26",
    title: "  完成归档  ",
    content: "  已复核  ",
  }, 23);
  const approval = buildContractApprovalReferenceCommand(17, {
    sourceKey: "future-flow.v1",
    externalRecordId: "AP-2026-001",
    externalUrl: "https://approval.example/records/AP-2026-001",
    statusSnapshot: "approved",
    approvedOn: "2026-07-25",
  }, 23, 4);
  const invalidApproval = buildContractApprovalReferenceCommand(17, {
    sourceKey: "审批 系统",
    externalRecordId: "AP-1",
    approvedOn: "2026-02-30",
  }, 23, 0);

  assert.equal(record.ok, true);
  if (record.ok) {
    assert.equal(record.data.title, "完成归档");
    assert.equal(record.data.content, "已复核");
  }
  assert.equal(approval.ok, true);
  assert.equal(invalidApproval.ok, false);
});
