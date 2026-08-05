import assert from "node:assert/strict";
import test from "node:test";

import {
  SHEETJS_PACKAGE_SPEC,
  SHEETJS_VENDOR_SHA256,
  SHEETJS_VENDOR_VERSION,
  inspectSheetjsVendor,
} from "./check-sheetjs-vendor.mjs";

test("vendored SheetJS artifact matches the pinned provenance facts", () => {
  const result = inspectSheetjsVendor();
  assert.deepEqual(result.errors, []);
  assert.equal(result.tarballVersion, SHEETJS_VENDOR_VERSION);
  assert.equal(result.sha256, SHEETJS_VENDOR_SHA256);
});

test("pinned SheetJS facts stay well-formed and point at the local tarball", () => {
  assert.match(SHEETJS_VENDOR_VERSION, /^0\.20\.3$/);
  assert.match(SHEETJS_VENDOR_SHA256, /^[0-9a-f]{64}$/);
  assert.equal(SHEETJS_PACKAGE_SPEC, "file:vendor/sheetjs/xlsx-0.20.3.tgz");
});
