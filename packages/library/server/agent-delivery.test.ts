import assert from "node:assert/strict";
import test from "node:test";

import {
  DIRECT_LIBRARY_FILE_LIMIT,
  isLibraryDeliveryRequest,
  resolveLibraryDeliveryQuery,
  selectLibraryDeliveryDocuments,
  shouldSendLibraryFilesDirectly,
} from "./agent-delivery-selection";

const documents = [
  "丰华生物-BP20260314.pptx",
  "丰华生物-2023.06.27章程修正案.pdf",
  "丰华生物财务报表-2023.12.xlsx",
  "丰华生物财务报表-2024.12.xlsx",
  "丰华生物财务报表-2025.12.xlsx",
  "审计报告2024年度-丰华生物有限公司.pdf",
  "丰华生物核心团队介绍.pptx",
].map((title, index) => ({
  documentUid: `document-${index}`,
  versionUid: `version-${index}`,
  title,
  docId: `LIB-${index}`,
  categoryName: index >= 2 && index <= 5 ? "财务" : "公司资料",
}));

test("delivery request keeps the business subject and can recover it from history", () => {
  assert.equal(resolveLibraryDeliveryQuery("把丰华生物的财务报表打包发给我"), "丰华生物的财务报表");
  assert.equal(resolveLibraryDeliveryQuery("你直接发给我", [
    { role: "user", content: "我需要丰华生物的财务报表" },
    { role: "agent", content: "找到了三份财务报表" },
  ]), "丰华生物的财务报表");
  assert.equal(resolveLibraryDeliveryQuery("你直接发给我"), "");
  assert.equal(isLibraryDeliveryRequest("不用打包发给我"), false);
  assert.equal(isLibraryDeliveryRequest("有哪些财务资料？"), false);
});

test("delivery selection narrows a broad candidate set to the strongest title matches", () => {
  assert.deepEqual(
    selectLibraryDeliveryDocuments("丰华生物的财务报表", documents).map((item) => item.title),
    [
      "丰华生物财务报表-2023.12.xlsx",
      "丰华生物财务报表-2024.12.xlsx",
      "丰华生物财务报表-2025.12.xlsx",
    ],
  );
  assert.equal(DIRECT_LIBRARY_FILE_LIMIT, 10);
  assert.equal(shouldSendLibraryFilesDirectly(7), true);
  assert.equal(shouldSendLibraryFilesDirectly(11), false);
});
