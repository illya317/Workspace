import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("DataSurface number and amount displays own right alignment", () => {
  const source = readFileSync(new URL("./DataSurface.renderers.tsx", import.meta.url), "utf8");
  const alignedFinancialDisplays = source.match(
    /<span className="block w-full text-right tabular-nums">/g,
  );

  assert.equal(alignedFinancialDisplays?.length, 2);
});
