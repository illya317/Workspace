import assert from "node:assert/strict";
import test from "node:test";

import { buildLibraryDocumentCandidateQuery } from "./search-candidate-query";

test("search excludes source-restricted generators before content recall", () => {
  const query = buildLibraryDocumentCandidateQuery({
    query: "财务报表",
    terms: ["财务报表"],
    maxConfidentialityLevel: 2,
    deniedGeneratorKeys: ["finance-report", "contract-ledger"],
  });

  assert.ok(query);
  assert.match(query.strings.join(""), /generatorKey.*NOT IN/s);
  assert.ok(query.values.includes("finance-report"));
  assert.ok(query.values.includes("contract-ledger"));
});
