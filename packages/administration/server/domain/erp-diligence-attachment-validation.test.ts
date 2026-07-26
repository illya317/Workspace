import assert from "node:assert/strict";
import test from "node:test";

import {
  buildErpDiligenceEvidenceAttachmentCommand,
  buildErpDiligenceEvidenceUploadCommand,
  ERP_DILIGENCE_ATTACHMENT_MAX_BYTES,
} from "./erp-diligence-attachment-validation";

test("ERP diligence evidence upload accepts a supported sample file", () => {
  const file = new File(["sample"], "销售订单样表.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const result = buildErpDiligenceEvidenceUploadCommand({ evidenceKey: "evidence-123-abc", file }, 7);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.fileName, "销售订单样表.xlsx");
  assert.equal(result.data.fileSize, 6);
});

test("ERP diligence evidence upload rejects executables and oversized files", () => {
  const executable = buildErpDiligenceEvidenceUploadCommand({
    evidenceKey: "evidence-123-abc",
    file: new File(["unsafe"], "payload.exe"),
  }, 7);
  assert.equal(executable.ok, false);

  const oversized = buildErpDiligenceEvidenceUploadCommand({
    evidenceKey: "evidence-123-abc",
    file: new File([new Uint8Array(ERP_DILIGENCE_ATTACHMENT_MAX_BYTES + 1)], "large.pdf"),
  }, 7);
  assert.equal(oversized.ok, false);
});

test("ERP diligence attachment command requires a UUID owned route target", () => {
  assert.equal(buildErpDiligenceEvidenceAttachmentCommand("not-a-uuid", 7).ok, false);
  assert.equal(buildErpDiligenceEvidenceAttachmentCommand("3d594650-3436-4aab-8bfb-9c7437f3c265", 7).ok, true);
});
