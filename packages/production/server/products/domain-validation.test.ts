import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductCreateCommand,
  validateProductCreateCommand,
  validateProductSkuUpdateCommand,
} from "../domain/product-validation";

test("product commit validation rejects a forged identity key", () => {
  const built = buildProductCreateCommand({
    userId: 7,
    body: { code: "P-001", name: "产品 A", strength: "10mg" },
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(validateProductCreateCommand({
    ...built.data,
    data: { ...built.data.data, identityKey: "forged" },
  }).ok, false);
});

test("SKU commit validation rejects invalid optimistic-lock versions", () => {
  const result = validateProductSkuUpdateCommand({
    id: 4,
    userId: 7,
    expectedVersion: 0,
    data: {
      code: "SKU-001",
      name: "产品 A",
      specification: null,
      baseUnit: "盒",
      contentUnit: null,
      unitsPerPackage: null,
      packagesPerCase: null,
      barcode: null,
      status: "active",
    },
  });
  assert.equal(result.ok, false);
});
