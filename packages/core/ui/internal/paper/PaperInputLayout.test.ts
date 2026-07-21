import assert from "node:assert/strict";
import test from "node:test";
import { adaptivePaperInputWidth } from "./PaperInputLayout";

test("paper inputs treat configured width as a minimum and expand with content", () => {
  assert.deepEqual(adaptivePaperInputWidth({ fieldKey: "date", width: "3rem" }), {
    width: "auto",
    minWidth: "max(3rem, 3rem)",
    maxWidth: "100%",
  });
});

test("auto paper inputs retain the shared minimum width", () => {
  assert.deepEqual(adaptivePaperInputWidth({ fieldKey: "date", width: "auto" }), {
    width: "auto",
    minWidth: "3rem",
    maxWidth: "100%",
  });
});
