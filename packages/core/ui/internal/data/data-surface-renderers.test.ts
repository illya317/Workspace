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

test("DataSurface truncated text accepts a character width and retains the full hover title", () => {
  const source = readFileSync(new URL("./DataSurface.renderers.tsx", import.meta.url), "utf8");

  assert.match(source, /maxWidth: `\$\{maxChars\}ch`/);
  assert.match(source, /value\.wrap === "truncate" \? textOverflowTitle\(value\.value\)/);
});

test("DataSurface interactive cells forward optional hover lifecycle callbacks", () => {
  const source = readFileSync(new URL("./DataSurface.renderers.tsx", import.meta.url), "utf8");

  assert.match(source, /onMouseEnter=\{value\.onMouseEnter\}/);
  assert.match(source, /onMouseLeave=\{value\.onMouseLeave\}/);
});
