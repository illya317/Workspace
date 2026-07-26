function safeFloat(value) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number"
    ? value
    : Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function safeInt(value) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number"
    ? value
    : Number.parseInt(String(value).replace(/,/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeString(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim() || null;
}

const COST_COMPONENT_FIELDS = [
  "rawMaterials",
  "packagingMaterials",
  "wage",
  "directLaborSocialSecurity",
  "directLaborWelfare",
  "auxiliaryLaborWage",
  "auxiliaryLaborSocialSecurity",
  "auxiliaryLaborWelfare",
  "utilities",
  "depreciationDirect",
  "depreciationAuxiliary",
  "otherManufacturingCost",
];

function rowComponentTotal(row) {
  const cost = row.cost ?? {};
  return COST_COMPONENT_FIELDS.reduce(
    (total, field) => total + Math.abs(safeFloat(cost[field]) ?? 0),
    0,
  );
}

function productIdentity(row) {
  return [
    safeInt(row.year),
    safeInt(row.month),
    safeString(row.source?.sheet),
    safeString(row.productStatus),
    safeString(row.productName),
  ].join("\u0000");
}

export function selectMonthlyProductRows(rows) {
  const selected = new Map();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    if (row.sourceSheetKind !== "monthly-cost") continue;
    const productStatus = safeString(row.productStatus);
    if (productStatus !== "产成品" && productStatus !== "在产品") continue;
    if (!safeString(row.productName)) continue;
    if (rowComponentTotal(row) <= 0) continue;
    if (productStatus === "产成品" && (safeFloat(row.inboundQuantity) ?? 0) <= 0) continue;

    const identity = productIdentity(row);
    const existing = selected.get(identity);
    const sourceRow = safeInt(row.source?.row) ?? Number.MAX_SAFE_INTEGER;
    const existingSourceRow = safeInt(existing?.source?.row) ?? Number.MAX_SAFE_INTEGER;
    if (!existing || sourceRow < existingSourceRow) {
      selected.set(identity, row);
    }
  }

  return [...selected.values()];
}

export function parseCostStructure(json, sourceFile) {
  const rows = selectMonthlyProductRows(json.standardRows ?? []);
  const facts = [];

  for (const row of rows) {
    const cost = row.cost ?? {};
    const year = safeInt(row.year) ?? 0;
    const month = safeInt(row.month);
    const productName = safeString(row.productName);
    const workHours = safeFloat(row.workHours);
    const inboundQty = safeFloat(row.inboundQuantity);
    const sourceSheet = safeString(row.source?.sheet);
    const sourceRow = safeInt(row.source?.row);

    facts.push({
      year,
      month,
      productStatus: safeString(row.productStatus),
      productName,
      workHours,
      rawMaterials: safeFloat(cost.rawMaterials),
      packagingMaterials: safeFloat(cost.packagingMaterials),
      directLaborWage: safeFloat(cost.wage),
      directLaborSocialSecurity: safeFloat(cost.directLaborSocialSecurity),
      directLaborWelfare: safeFloat(cost.directLaborWelfare),
      auxiliaryLaborWage: safeFloat(cost.auxiliaryLaborWage),
      auxiliaryLaborSocialSecurity: safeFloat(cost.auxiliaryLaborSocialSecurity),
      auxiliaryLaborWelfare: safeFloat(cost.auxiliaryLaborWelfare),
      utilities: safeFloat(cost.utilities),
      depreciationDirect: safeFloat(cost.depreciationDirect),
      depreciationAuxiliary: safeFloat(cost.depreciationAuxiliary),
      otherManufacturingCost: safeFloat(cost.otherManufacturingCost),
      quantity: inboundQty,
      unit: "件",
      sourceFile: safeString(sourceFile) ?? safeString(json.sourceFile) ?? "",
      sourceSheet,
      sourceRow,
    });
  }

  return { facts, warnings: 0 };
}
