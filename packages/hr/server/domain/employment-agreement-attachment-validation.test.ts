import assert from "node:assert/strict";
import test from "node:test";

import { buildEmploymentAgreementAttachmentUploadCommand } from "./employment-agreement-attachment-validation";

const identity = {
  employeeId: 1,
  agreementUid: "be3d8441-9297-4ad9-aab9-2801dd4b06a6",
  userId: 2,
};

test("agreement attachment accepts PDFs and preserves the original file", () => {
  const file = new File([new Uint8Array([37, 80, 68, 70])], "劳动合同.pdf", { type: "application/pdf" });
  const result = buildEmploymentAgreementAttachmentUploadCommand({ ...identity, file, note: "  签署件  " });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.fileName, "劳动合同.pdf");
    assert.equal(result.data.note, "签署件");
  }
});

test("agreement attachment rejects executable files", () => {
  const file = new File(["bad"], "合同.exe", { type: "application/octet-stream" });
  assert.equal(buildEmploymentAgreementAttachmentUploadCommand({ ...identity, file }).ok, false);
});
