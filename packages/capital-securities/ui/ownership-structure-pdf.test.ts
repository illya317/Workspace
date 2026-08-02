import assert from "node:assert/strict";
import test from "node:test";

import { buildJpegPdf } from "./ownership-structure-pdf";

test("buildJpegPdf creates a one-page A3 landscape PDF with the JPEG embedded", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = buildJpegPdf({ jpeg, width: 2424, height: 1300 });
  const text = new TextDecoder("latin1").decode(pdf);

  assert.equal(text.startsWith("%PDF-1.4\n"), true);
  assert.match(text, /\/Type \/Pages \/Kids \[3 0 R] \/Count 1/);
  assert.match(text, /\/MediaBox \[0 0 1190\.55 841\.89]/);
  assert.match(text, /\/Subtype \/Image \/Width 2424 \/Height 1300/);
  assert.match(text, /\/Filter \/DCTDecode \/Length 4/);
  assert.equal(text.endsWith("%%EOF\n"), true);

  const xrefOffset = Number(text.match(/startxref\n(\d+)\n/)?.[1]);
  assert.equal(text.slice(xrefOffset, xrefOffset + 4), "xref");
});

test("buildJpegPdf rejects empty image input", () => {
  assert.throws(
    () => buildJpegPdf({ jpeg: new Uint8Array(), width: 0, height: 0 }),
    /PDF 图片内容无效/,
  );
});
