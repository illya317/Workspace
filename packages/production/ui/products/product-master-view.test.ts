import assert from "node:assert/strict";
import test from "node:test";

import { resolveProductMasterCreateKind } from "./product-master-view";

test("product master exposes at most one PageSurface create spec for each tab", () => {
  assert.equal(resolveProductMasterCreateKind("product", false), "product");
  assert.equal(resolveProductMasterCreateKind("product", true), "product");
  assert.equal(resolveProductMasterCreateKind("skus", true), "sku");
  assert.equal(resolveProductMasterCreateKind("skus", false), null);
  assert.equal(resolveProductMasterCreateKind("mappings", true), null);
});
