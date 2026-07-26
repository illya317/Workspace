import assert from "node:assert/strict";
import test from "node:test";

import {
  DIRECT_LIBRARY_FILE_LIMIT,
  selectLibraryDeliveryDocuments,
  shouldSendLibraryFilesDirectly,
} from "./agent-delivery-selection";

const documents = [
  "示例集团-BP20260314.pptx",
  "示例集团-2023.06.27章程修正案.pdf",
  "示例集团财务报表-2023.12.xlsx",
  "示例集团财务报表-2024.12.xlsx",
  "示例集团财务报表-2025.12.xlsx",
  "审计报告2024年度-示例集团有限公司.pdf",
  "示例集团核心团队介绍.pptx",
].map((title, index) => ({
  documentUid: `document-${index}`,
  versionUid: `version-${index}`,
  title,
  docId: `LIB-${index}`,
  categoryName: index >= 2 && index <= 5 ? "财务" : "公司资料",
}));

test("delivery selection narrows a broad candidate set to the strongest title matches", () => {
  assert.deepEqual(
    selectLibraryDeliveryDocuments("示例集团的财务报表", documents).map((item) => item.title),
    [
      "示例集团财务报表-2023.12.xlsx",
      "示例集团财务报表-2024.12.xlsx",
      "示例集团财务报表-2025.12.xlsx",
    ],
  );
  assert.equal(DIRECT_LIBRARY_FILE_LIMIT, 5);
  assert.equal(shouldSendLibraryFilesDirectly(5), true);
  assert.equal(shouldSendLibraryFilesDirectly(6), false);
});
