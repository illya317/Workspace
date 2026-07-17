import assert from "node:assert/strict";
import test from "node:test";

import {
  libraryOfficeDocumentKey,
  libraryOfficeDocumentType,
  renderLibraryOnlyOfficeHtml,
} from "./onlyoffice-contract";

test("libraryOfficeDocumentType maps Office families and rejects PDF", () => {
  assert.equal(libraryOfficeDocumentType("DOCX"), "word");
  assert.equal(libraryOfficeDocumentType("xlsx"), "cell");
  assert.equal(libraryOfficeDocumentType("pptx"), "slide");
  assert.equal(libraryOfficeDocumentType("pdf"), null);
});

test("libraryOfficeDocumentKey is stable and provider-safe", () => {
  const key = libraryOfficeDocumentKey("version:with spaces", "a".repeat(64));
  assert.equal(key, `versionwithspaces-${"a".repeat(32)}`);
  assert.ok(key.length <= 128);
});

test("renderLibraryOnlyOfficeHtml escapes title and embedded config", () => {
  const html = renderLibraryOnlyOfficeHtml({
    title: "<unsafe>",
    apiScriptPath: "/workspace/onlyoffice/api.js",
    nonce: "nonce-value",
    config: { document: { title: "</script><script>unsafeCall()</script>" } },
  });
  assert.match(html, /&lt;unsafe&gt;/);
  assert.match(html, /nonce="nonce-value"/);
  assert.ok(!html.includes("</script><script>unsafeCall()</script>"));
  assert.match(html, /\\u003c\/script>/);
});
