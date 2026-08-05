import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

// The SheetJS ESM build does not bind Node fs; readFile/writeFile require an explicit binding.
XLSX.set_fs(fs);

export function normalizeSourceText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, "").replace(/[×xX]/g, "*");
}

export function productIdentityKey(name, strength) {
  return `${normalizeSourceText(name).toLowerCase()}|${normalizeSourceText(strength).toLowerCase()}`;
}

export function stableCode(prefix, key, length = 10) {
  return `${prefix}-${crypto.createHash("sha1").update(key).digest("hex").slice(0, length).toUpperCase()}`;
}

function canonicalSpecification(rawSpecification) {
  const parts = normalizeSourceText(rawSpecification).split("*").filter(Boolean);
  let packagesPerCase = null;
  const last = parts.at(-1) ?? "";
  const logistic = last.match(/^(\d+(?:\.\d+)?)(盒|瓶|袋|支)(?:\/件)?$/);
  if (logistic && (last.includes("/件") || Number(logistic[1]) >= 200)) {
    packagesPerCase = Number(logistic[1]);
    parts.pop();
  }
  return { specification: parts.map((part) => part.replace(/\/盒$/, "")).join("*"), packagesPerCase };
}

function packagingFacts(specification) {
  const parts = specification.split("*");
  const content = parts.find((part) => /\d+(?:\.\d+)?(?:片|粒|袋|支)/.test(part));
  const contentMatch = content?.match(/(\d+(?:\.\d+)?)(片|粒|袋|支)/);
  if (!contentMatch) return { contentUnit: null, unitsPerPackage: null };
  const board = parts.find((part) => /^\d+(?:\.\d+)?板$/.test(part));
  const boardCount = board ? Number(board.match(/^\d+(?:\.\d+)?/)?.[0] ?? 1) : 1;
  return { contentUnit: contentMatch[2], unitsPerPackage: Number(contentMatch[1]) * boardCount };
}

function dosageForm(name) {
  if (name.includes("胶囊")) return "胶囊剂";
  if (name.includes("片")) return "片剂";
  return null;
}

function sourceRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const result = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
    const headerIndex = rows.findIndex((row) => row.includes("产品名称") && row.includes("规格型号"));
    if (headerIndex < 0) continue;
    const header = rows[headerIndex];
    const nameIndex = header.indexOf("产品名称");
    const specificationIndex = header.indexOf("规格型号");
    const unitIndex = header.indexOf("主计量单位");
    for (let index = headerIndex + 1; index < rows.length; index += 1) {
      const name = String(rows[index][nameIndex] ?? "").trim();
      if (!name || name.includes("合计")) continue;
      result.push({ sourceFile: path.basename(filePath), sourceSheet: sheetName, sourceRow: index + 1, name, rawSpecification: String(rows[index][specificationIndex] ?? "").trim(), baseUnit: String(rows[index][unitIndex] ?? "").trim() || "盒" });
    }
  }
  return result;
}

export function parseProductMasterSources(inputDir) {
  const files = fs.readdirSync(inputDir).filter((file) => /^产成品入库单列表.*\.xls$/i.test(file)).sort();
  const rows = files.flatMap((file) => sourceRows(path.join(inputDir, file)));
  const skuMap = new Map();
  for (const row of rows) {
    const normalizedName = normalizeSourceText(row.name);
    const rawSpecification = normalizeSourceText(row.rawSpecification);
    const { specification, packagesPerCase } = canonicalSpecification(rawSpecification);
    const strength = specification.split("*")[0] || null;
    const productKey = productIdentityKey(normalizedName, strength);
    const skuKey = `${productKey}|${normalizeSourceText(specification).toLowerCase()}|${normalizeSourceText(row.baseUnit).toLowerCase()}`;
    const current = skuMap.get(skuKey) ?? {
      key: skuKey,
      code: stableCode("SKU", skuKey),
      name: normalizedName,
      specification,
      baseUnit: row.baseUnit,
      ...packagingFacts(specification),
      packagesPerCase: null,
      product: { key: productKey, code: stableCode("PRD", productKey, 8), name: normalizedName, dosageForm: dosageForm(normalizedName), strength },
      sources: [],
    };
    if (packagesPerCase) current.packagesPerCase = Math.max(current.packagesPerCase ?? 0, packagesPerCase);
    const sourceKey = `${normalizeSourceText(row.name)}|${rawSpecification}|${normalizeSourceText(row.baseUnit)}`;
    if (!current.sources.some((source) => source.key === sourceKey)) current.sources.push({ ...row, key: sourceKey, normalizedName, normalizedSpecification: rawSpecification });
    skuMap.set(skuKey, current);
  }
  const skus = [...skuMap.values()].sort((left, right) => left.key.localeCompare(right.key, "zh-CN"));
  const products = [...new Map(skus.map((sku) => [sku.product.key, sku.product])).values()].sort((left, right) => left.key.localeCompare(right.key, "zh-CN"));
  return { files, rowCount: rows.length, products, skus };
}

export function resolveCostAlias(sourceName, products, skus, aliases) {
  const normalized = normalizeSourceText(sourceName);
  const formalProduct = products.find((product) => normalized.startsWith(normalizeSourceText(product.name)))?.name
    ?? Object.entries(aliases).sort(([left], [right]) => right.length - left.length).find(([alias]) => normalized.startsWith(normalizeSourceText(alias)))?.[1]
    ?? null;
  if (!formalProduct) return { product: null, sku: null, reason: "unknown_product_alias" };
  const product = products.find((candidate) => candidate.name === formalProduct) ?? null;
  if (!product) return { product: null, sku: null, reason: "product_not_in_receipts" };
  const candidates = skus.filter((sku) => sku.product.key === product.key);
  const suffix = normalized.replace(new RegExp(`^${Object.keys(aliases).sort((a, b) => b.length - a.length).find((alias) => normalized.startsWith(normalizeSourceText(alias))) ?? normalizeSourceText(formalProduct)}`), "");
  const firstCount = Number(suffix.match(/\d+(?:\.\d+)?/)?.[0] ?? 0) || null;
  const secondaryCount = Number(suffix.match(/\*(\d+(?:\.\d+)?)(?:板|$)/)?.[1] ?? 1);
  const boardCount = secondaryCount > 0 && secondaryCount <= 10 ? secondaryCount : 1;
  const count = firstCount ? firstCount * boardCount : null;
  if (count) {
    const matched = candidates.filter((sku) => sku.unitsPerPackage === count);
    return matched.length === 1 ? { product, sku: matched[0], reason: null } : { product, sku: null, reason: matched.length ? "ambiguous_sku" : "sku_not_in_receipts" };
  }
  return candidates.length === 1 ? { product, sku: candidates[0], reason: null } : { product, sku: null, reason: "sku_required" };
}
