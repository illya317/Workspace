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

function sourceScope(value) {
  const source = value?.metadata?.source || value?.source || {};
  return [source.stageKey, source.testKey].join("/");
}

function walk(value, visit) {
  if (!value || typeof value !== "object") return;
  visit(value);
  if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
  else Object.values(value).forEach((item) => walk(item, visit));
}

function formulaReferencesAlias(formula, alias) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`, "i").test(formula);
}

function multipliedByOneHundredCount(formula) {
  return (formula.match(/(?:\*|×)\s*100(?![\d.])/g) || []).length;
}

function auditPercentFormulaPresentation(payload) {
  const fields = Object.values(payload.fieldModel?.fields || {});
  const percentInputsByScope = new Map();
  for (const field of fields) {
    if (field.formulaInputMode !== "percent") continue;
    const scope = sourceScope(field);
    const inputs = percentInputsByScope.get(scope) || [];
    inputs.push(field);
    percentInputsByScope.set(scope, inputs);
  }

  let formulaSlots = 0;
  let percentOutputFormulaSlots = 0;
  let percentInputFormulaSlots = 0;
  walk(payload.document, (value) => {
    if (Array.isArray(value) || !Array.isArray(value.parts)) return;
    value.parts.forEach((slot, index) => {
      if (slot?.type !== "formulaSlot" || !slot.formulaText) return;
      formulaSlots += 1;
      const suffix = value.parts[index + 1]?.type === "text"
        ? String(value.parts[index + 1].text || "")
        : "";
      const suffixPercentCount = (suffix.match(/[%％]/g) || []).length;
      if (suffixPercentCount === 1) percentOutputFormulaSlots += 1;
      if (suffixPercentCount > 1) {
        fail(`QC snapshot ${payload.productKey} formula ${slot.fieldKey} has a duplicate percent suffix: ${JSON.stringify(suffix)}`);
      }
      if (suffixPercentCount && (slot.unit === "%" || slot.unit === "％" || slot.numberDisplayMode === "percent")) {
        fail(`QC snapshot ${payload.productKey} formula ${slot.fieldKey} combines percent display metadata with a text percent suffix`);
      }

      const formula = String(slot.formulaText);
      const percentInputs = (percentInputsByScope.get(sourceScope(slot)) || [])
        .filter((field) => field.alias && formulaReferencesAlias(formula, String(field.alias)));
      if (!percentInputs.length) return;
      percentInputFormulaSlots += 1;
      const conversionCount = multipliedByOneHundredCount(formula);
      if (conversionCount !== 1) {
        fail(`QC snapshot ${payload.productKey} formula ${slot.fieldKey} references percentage input(s) ${percentInputs.map((field) => field.alias).join(",")} but has ${conversionCount} final ×100 conversions`);
      }
    });
  });
  return { formulaSlots, percentOutputFormulaSlots, percentInputFormulaSlots, percentInputs: fields.filter((field) => field.formulaInputMode === "percent").length };
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

let checkedFormulaSlots = 0;
let checkedPercentOutputFormulaSlots = 0;
let checkedPercentInputFormulaSlots = 0;
let checkedPercentInputs = 0;
for (const key of EXPECTED_QC_PRODUCTS) {
  const payload = readJson(path.join(productRoot, `${key}.json`));
  if (payload.productKey !== key) fail(`QC snapshot productKey mismatch: ${key}`);
  const cellCounts = signatureFooterCells(payload.document);
  const badCounts = cellCounts.filter((count) => count !== 4);
  if (badCounts.length) fail(`QC snapshot ${key} has non-4-cell signature footer rows: ${[...new Set(badCounts)].join(",")}`);
  const percentAudit = auditPercentFormulaPresentation(payload);
  checkedFormulaSlots += percentAudit.formulaSlots;
  checkedPercentOutputFormulaSlots += percentAudit.percentOutputFormulaSlots;
  checkedPercentInputFormulaSlots += percentAudit.percentInputFormulaSlots;
  checkedPercentInputs += percentAudit.percentInputs;
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
  process.stdout.write(`Docs editor official templates OK: 17 fixed templates (16 QC + 1 HR); percent audit inputs=${checkedPercentInputs} referencing-formulas=${checkedPercentInputFormulaSlots} percent-outputs=${checkedPercentOutputFormulaSlots} formula-slots=${checkedFormulaSlots}.\n`);
}
