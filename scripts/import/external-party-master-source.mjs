import path from "node:path";
import crypto from "node:crypto";
import XLSX from "xlsx";

const PROFILE_DEFINITIONS = {
  customer: {
    sourceSystem: "cost.customer-archive",
    codeHeader: "客户编码",
    nameHeader: "客户名称",
    shortNameHeader: "客户简称",
  },
  supplier: {
    sourceSystem: "cost.supplier-archive",
    codeHeader: "供应商编码",
    nameHeader: "供应商名称",
    shortNameHeader: "供应商简称",
  },
};

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null));
}

export function sourceText(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim() || null;
}

export function normalizeExternalPartyName(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s\u3000]+/g, "")
    .toLocaleLowerCase("zh-CN");
}

export function stableProvisionalCode(companyCode, sourceName) {
  const digest = crypto.createHash("sha256")
    .update(normalizeExternalPartyName(sourceName))
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
  return `CUS-${companyCode}-SHP-${digest}`;
}

export function archiveRoleCode(category, companyCode, sourceCode) {
  const prefix = category === "customer" ? "CUS" : "SUP";
  return `${prefix}-${companyCode}-${sourceCode}`;
}

export function temporaryArchiveIdentity(category, companyCode, sourceCode) {
  return `TEMP-${archiveRoleCode(category, companyCode, sourceCode)}`;
}

export function temporaryShipmentIdentity(companyCode, sourceName) {
  return `TEMP-${stableProvisionalCode(companyCode, sourceName)}`;
}

export function temporarySharedIdentity(companyCode, sourceName) {
  const digest = stableProvisionalCode(companyCode, sourceName).split("-").at(-1);
  return `TEMP-EXT-${companyCode}-${digest}`;
}

function rowValue(row, indexByHeader, header) {
  const index = indexByHeader.get(header);
  return index === undefined ? null : sourceText(row[index]);
}

function numericValue(value) {
  const text = sourceText(value);
  if (!text) return null;
  const number = Number.parseFloat(text.replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(number) ? number : null;
}

function parseRows(rows, profile, sourceFile, sourceSheet) {
  const definition = PROFILE_DEFINITIONS[profile];
  if (!definition) throw new Error(`Unsupported external-party master profile: ${profile}`);
  const headers = rows[0]?.map((value) => sourceText(value) ?? "") ?? [];
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  for (const required of [definition.codeHeader, definition.nameHeader]) {
    if (!indexByHeader.has(required)) throw new Error(`${sourceFile}/${sourceSheet} 缺少列：${required}`);
  }

  const records = [];
  const sourceKeys = new Set();
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const code = rowValue(row, indexByHeader, definition.codeHeader);
    const legalName = rowValue(row, indexByHeader, definition.nameHeader);
    if (!code && !legalName) continue;
    if (!code || !legalName) throw new Error(`${sourceFile}/${sourceSheet} 第 ${index + 1} 行缺少编码或名称`);
    const sourceKey = `code:${code}`;
    if (sourceKeys.has(sourceKey)) throw new Error(`${sourceFile}/${sourceSheet} 来源编码重复：${code}`);
    sourceKeys.add(sourceKey);
    const shortName = rowValue(row, indexByHeader, definition.shortNameHeader);
    const common = {
      code,
      legalName,
      shortName,
      displayName: shortName || legalName,
      contactPerson: rowValue(row, indexByHeader, "联系人"),
      phone: rowValue(row, indexByHeader, "电话"),
      salespersonName: rowValue(row, indexByHeader, "专营业务员名称"),
    };
    const sourceData = profile === "customer"
      ? compactObject({
          ...common,
          regionName: rowValue(row, indexByHeader, "地区名称"),
          developmentDate: rowValue(row, indexByHeader, "发展日期"),
          departmentName: rowValue(row, indexByHeader, "分管部门名称"),
          potentialCustomerCode: rowValue(row, indexByHeader, "潜在客户编码"),
          taxRate: numericValue(rowValue(row, indexByHeader, "税率%")),
        })
      : compactObject({
          ...common,
          address: rowValue(row, indexByHeader, "地址"),
          developmentDate: rowValue(row, indexByHeader, "发展日期"),
          mobile: rowValue(row, indexByHeader, "手机"),
        });
    records.push({
      category: profile,
      sourceSystem: definition.sourceSystem,
      sourceKey,
      sourceCode: code,
      sourceName: legalName,
      sourceNameNormalized: normalizeExternalPartyName(legalName),
      sourceFile,
      sourceSheet,
      sourceRow: index + 1,
      sourceData,
      ...common,
      address: profile === "supplier" ? sourceData.address ?? null : null,
      taxRate: profile === "customer" ? sourceData.taxRate ?? null : null,
    });
  }
  return records;
}

export function parseExternalPartyMasterWorkbook(filePath, profile) {
  const workbook = XLSX.readFile(filePath, { codepage: 936, cellDates: false });
  const sourceFile = path.basename(filePath);
  return workbook.SheetNames.flatMap((sourceSheet) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sourceSheet], {
      header: 1,
      raw: false,
      defval: null,
      blankrows: false,
    });
    return parseRows(rows, profile, sourceFile, sourceSheet);
  });
}

export function aliasesForRecord(record) {
  return [...new Set([record.displayName, record.legalName, record.shortName]
    .map(normalizeExternalPartyName)
    .filter(Boolean))];
}
