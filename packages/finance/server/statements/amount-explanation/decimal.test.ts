import assert from "node:assert/strict";
import test from "node:test";

import {
  DecimalNormalizationError,
  currencyScale,
  decimalLikeToMinorUnits,
  formatMinorUnits,
  numberToMinorUnits,
  parseDecimalToMinorUnits,
} from "./decimal";

test("parses plain decimals to signed minor units", () => {
  assert.equal(parseDecimalToMinorUnits("12124.40", 2), 1212440n);
  assert.equal(parseDecimalToMinorUnits("-12124.40", 2), -1212440n);
  assert.equal(parseDecimalToMinorUnits("+0.05", 2), 5n);
  assert.equal(parseDecimalToMinorUnits("42", 2), 4200n);
});

test("parses strictly grouped thousands separators", () => {
  assert.equal(parseDecimalToMinorUnits("-12,124.40", 2), -1212440n);
  assert.equal(parseDecimalToMinorUnits("88,054,250.60", 2), 8805425060n);
  assert.throws(() => parseDecimalToMinorUnits("12,12.40", 2), DecimalNormalizationError);
  assert.throws(() => parseDecimalToMinorUnits("1,23,456.00", 2), DecimalNormalizationError);
});

test("currency scale is fail-closed and honored", () => {
  assert.equal(currencyScale("CNY"), 2);
  assert.equal(currencyScale("cad"), 2);
  assert.equal(currencyScale("JPY"), 0);
  assert.throws(() => currencyScale("XXX"), DecimalNormalizationError);
  assert.equal(parseDecimalToMinorUnits("1234", 0), 1234n);
  assert.throws(() => parseDecimalToMinorUnits("1234.5", 0), DecimalNormalizationError);
});

test("negative zero normalizes to zero without a sign", () => {
  assert.equal(parseDecimalToMinorUnits("-0.00", 2), 0n);
  assert.equal(parseDecimalToMinorUnits("-0", 2), 0n);
  assert.equal(formatMinorUnits(parseDecimalToMinorUnits("-0.00", 2), 2), "0.00");
});

test("sign is preserved end-to-end", () => {
  assert.equal(formatMinorUnits(-1212440n, 2), "-12124.40");
  assert.equal(formatMinorUnits(5n, 2), "0.05");
  assert.equal(formatMinorUnits(-5n, 2), "-0.05");
  assert.equal(formatMinorUnits(1234n, 0), "1234");
});

test("rejects invalid shapes and precision fail-closed", () => {
  for (const bad of ["", "abc", "1e5", "1.", ".5", "0.001", "1,2,3", "--1", "1.2.3"]) {
    assert.throws(() => parseDecimalToMinorUnits(bad, 2), DecimalNormalizationError, bad);
  }
});

test("rejects overflow beyond the Decimal(20,2) ceiling", () => {
  assert.equal(parseDecimalToMinorUnits("999999999999999999.99", 2), 99999999999999999999n);
  assert.throws(() => parseDecimalToMinorUnits("9999999999999999999.99", 2), DecimalNormalizationError);
  assert.throws(() => parseDecimalToMinorUnits("1000000000000000000", 2), DecimalNormalizationError);
});

test("float conversion accepts exact minor-unit values and rejects dirty ones", () => {
  assert.equal(numberToMinorUnits(12124.4, 2), 1212440n);
  assert.equal(numberToMinorUnits(-0.01, 2), -1n);
  assert.equal(numberToMinorUnits(0, 2), 0n);
  assert.throws(() => numberToMinorUnits(100.005, 2), DecimalNormalizationError);
  assert.throws(() => numberToMinorUnits(Number.NaN, 2), DecimalNormalizationError);
  assert.throws(() => numberToMinorUnits(Number.POSITIVE_INFINITY, 2), DecimalNormalizationError);
});

test("decimal-like conversion covers strings, numbers, bigints and Decimal objects", () => {
  assert.equal(decimalLikeToMinorUnits("123.45", 2), 12345n);
  assert.equal(decimalLikeToMinorUnits(123.45, 2), 12345n);
  assert.equal(decimalLikeToMinorUnits(12345n, 2), 12345n);
  // Prisma Decimal duck type
  assert.equal(decimalLikeToMinorUnits({ toString: () => "-40.00" }, 2), -4000n);
  assert.throws(() => decimalLikeToMinorUnits(null, 2), DecimalNormalizationError);
  assert.throws(() => decimalLikeToMinorUnits(undefined, 2), DecimalNormalizationError);
});
