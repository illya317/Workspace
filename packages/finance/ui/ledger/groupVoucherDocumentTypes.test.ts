import assert from "node:assert/strict";
import test from "node:test";

import { GROUP_VOUCHER_DOCUMENT_TYPE_OPTIONS } from "./groupVoucherDocumentTypes";

test("group voucher filters expose the complete document taxonomy", () => {
  assert.deepEqual(GROUP_VOUCHER_DOCUMENT_TYPE_OPTIONS, [
    { value: "", label: "全部类别" },
    { value: "groupAdjustment", label: "集团调整" },
    { value: "elimination", label: "内部抵销" },
    { value: "reclassification", label: "列报重分类" },
    { value: "allocation", label: "少数股东分配" },
  ]);
});
