const fs = require("fs");
const path = require("path");

const EXPECTED_QC_PRODUCTS = [
  "allopurinol",
  "atenolol",
  "azithromycin",
  "berberine_tannate",
  "clarithromycin",
  "compound_rutin",
  "diammonium_glycyrrhizinate",
  "hydrochlorothiazide",
  "isosorbide_dinitrate",
  "levofloxacin",
  "methimazole",
  "pantoprazole",
  "simvastatin",
  "spironolactone",
  "terazosin",
  "verapamil",
];

const repoRoot = process.cwd();
const qcRoot = path.join(repoRoot, "generated", "production", "qc", "template-snapshots");
const oldQcRoot = path.join(repoRoot, "generated", "docs-editor", "qc");
const hrSourcePath = path.join(
  repoRoot,
  "packages",
  "platform",
  "server",
  "docs-editor",
  "official-template-sources",
  "hr-position-description.json",
);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function signatureFooterCells(document) {
  return (document.blocks || [])
    .filter((block) => block.type === "table" && block.label === "test_signature_footer")
    .map((table) => Math.max(0, ...(table.rows || []).map((row) => (row.cells || []).length)));
}

if (fs.existsSync(oldQcRoot)) {
  fail(`Legacy QC snapshot path must not exist: ${path.relative(repoRoot, oldQcRoot)}`);
}

const productRoot = path.join(qcRoot, "products");
const files = fs.existsSync(productRoot)
  ? fs.readdirSync(productRoot).filter((file) => file.endsWith(".json")).sort()
  : [];
const actualProducts = files.map((file) => path.basename(file, ".json"));
const missing = EXPECTED_QC_PRODUCTS.filter((key) => !actualProducts.includes(key));
const extra = actualProducts.filter((key) => !EXPECTED_QC_PRODUCTS.includes(key));
if (missing.length || extra.length) {
  fail(`QC official snapshots must be fixed to 16 products. missing=${missing.join(",") || "-"} extra=${extra.join(",") || "-"}`);
}

for (const key of EXPECTED_QC_PRODUCTS) {
  const payload = readJson(path.join(productRoot, `${key}.json`));
  if (payload.productKey !== key) fail(`QC snapshot productKey mismatch: ${key}`);
  const cellCounts = signatureFooterCells(payload.document);
  const badCounts = cellCounts.filter((count) => count !== 4);
  if (badCounts.length) fail(`QC snapshot ${key} has non-4-cell signature footer rows: ${[...new Set(badCounts)].join(",")}`);
}

const audit = readJson(path.join(qcRoot, "audit.json"));
if (!String(audit.outputRoot || "").endsWith("generated/production/qc/template-snapshots")) {
  fail("QC snapshot audit outputRoot must point at generated/production/qc/template-snapshots");
}

const hrSource = readJson(hrSourcePath);
if (hrSource.sourceKind !== "hr.position-description.official" || hrSource.sourceProductKey !== "hr.position-description.default") {
  fail("HR official template source identity is invalid");
}
if (!hrSource.document || !hrSource.fieldModel) {
  fail("HR official template source must include document and fieldModel");
}

if (!process.exitCode) {
  process.stdout.write("Docs editor official templates OK: 17 fixed templates (16 QC + 1 HR).\n");
}
