import assert from "node:assert/strict";
import test from "node:test";
import { runtimeSlotWidthStyle } from "./runtime-value-slot";

test("runtime slots treat zero width as content-adaptive", () => {
  assert.deepEqual(runtimeSlotWidthStyle(0), { width: "auto", maxWidth: "100%" });
  assert.deepEqual(runtimeSlotWidthStyle("0"), { width: "auto", maxWidth: "100%" });
  assert.deepEqual(runtimeSlotWidthStyle("0rem"), { width: "auto", maxWidth: "100%" });
});

test("runtime slots treat configured width as a minimum", () => {
  assert.deepEqual(runtimeSlotWidthStyle("6rem"), {
    width: "auto",
    minWidth: "min(6rem, 100%)",
    maxWidth: "100%",
  });
});
