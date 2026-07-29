#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { DATA_RELEASE_REFERENCE_CONTRACTS } from "../../ops/data-release-reference-contracts.mjs";
import { registeredDataReleaseHandlerIds } from "../../ops/data-release-handlers.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const BASELINE_FILE = path.join(ROOT, "scripts/check/import-reference-legacy-baseline.json");
const MASTER_MODELS = new Set(["Company", "Department", "Employee", "Position", "Project", "Product", "Party"]);
const ALLOWED_DISPOSITIONS = new Set(["foreign_key", "raw_with_fk", "legacy_semantic_key"]);
const LEGACY_REFERENCE_ALLOWLIST = new Set();
const GOVERNED_SOURCE_SNAPSHOTS = new Map([
  ["FinanceGroupAccount.originLocalAccountCode", {
    companionField: "originCompanyId",
    companionTarget: "Company",
    reason: "来源科目编码按年度重复，GroupAccount 只保留不可变来源证据，不能任意绑定某一年度 FinanceAccount",
  }],
  ["FinanceStatementSourcePackage.parsedCompanyName", {
    companionField: "companyId",
    companionTarget: "Company",
    reason: "解析出的工作簿公司名属于不可变来源证据，正式公司身份由 companyId 承担",
  }],
]);

function prismaFiles() {
  const modelRoot = path.join(ROOT, "prisma/models");
  return fs.readdirSync(modelRoot).filter((name) => name.endsWith(".prisma")).sort().map((name) => path.join(modelRoot, name));
}

function parseSchema() {
  const models = new Map();
  for (const file of prismaFiles()) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/\bmodel\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
      const [, name, body] = match;
      const fields = new Map();
      const relationSources = new Map();
      const relationTargets = new Set();
      for (const rawLine of body.split("\n")) {
        const line = rawLine.replace(/\/\/.*$/, "").trim();
        const field = line.match(/^(\w+)\s+([\w\[\]?]+)/);
        if (!field) continue;
        fields.set(field[1], { type: field[2].replace(/[\[\]?]/g, ""), line });
        const relation = line.match(/@relation\([^)]*fields:\s*\[([^\]]+)]/);
        if (!relation) continue;
        relationTargets.add(field[2].replace(/[\[\]?]/g, ""));
        for (const sourceField of relation[1].split(",").map((value) => value.trim())) {
          relationSources.set(sourceField, field[2].replace(/[\[\]?]/g, ""));
        }
      }
      models.set(name, { name, file: path.relative(ROOT, file), fields, relationSources, relationTargets });
    }
  }
  return models;
}

function identityTarget(fieldName) {
  const value = fieldName.toLowerCase();
  const suffix = "(?:id|code|name|namesnapshot|codesnapshot)";
  let token = null;
  if (new RegExp(`company${suffix}$`).test(value) || value === "currentcompany") token = "company";
  else if (new RegExp(`(?:department|dept)${suffix}$`).test(value) || value === "dept") token = "department";
  else if (new RegExp(`employee${suffix}$`).test(value)) token = "employee";
  else if (new RegExp(`position${suffix}$`).test(value)) token = "position";
  else if (new RegExp(`project${suffix}$`).test(value) || value === "project") token = "project";
  else if (new RegExp(`account(?:id|code|name)$`).test(value)) token = "account";
  else if (new RegExp(`product${suffix}$`).test(value)) token = "product";
  else if (new RegExp(`(?:party|customer|supplier)${suffix}$`).test(value) || value === "counterparty") token = "party";
  else if (new RegExp(`warehouse${suffix}$`).test(value)) token = "warehouse";
  if (!token) return null;
  if (token === "company") return new Set(["Company"]);
  if (token === "department" || token === "dept") return new Set(["Department"]);
  if (token === "employee") return new Set(["Employee"]);
  if (token === "position") return new Set(["Position"]);
  if (token === "project") return new Set(["Project"]);
  if (token === "account") return new Set(["FinanceAccount"]);
  if (token === "product") return new Set(["Product", "InventoryItem"]);
  if (token === "party" || token === "customer" || token === "supplier" || token === "counterparty") return new Set(["Party"]);
  if (token === "warehouse") return new Set(["InventoryWarehouse"]);
  if (token === "item") return new Set(["InventoryItem"]);
  return null;
}

function expectedForeignKeyFields(fieldName, targets) {
  const value = fieldName.toLowerCase();
  if (value === "currentcompany") return ["companyId"];
  if (value === "counterparty") return ["counterpartyId", "counterpartyPartyId", "counterpartyExternalRoleId"];

  const company = fieldName.match(/^(.*)Company(?:Code|Name|NameSnapshot|CodeSnapshot)$/i);
  if (company) return [`${company[1]}CompanyId`.replace(/^CompanyId$/, "companyId")];
  const department = fieldName.match(/^(.*?)(?:Department|Dept)(?:Code|Name|NameSnapshot|CodeSnapshot)$/i);
  if (department) return [`${department[1]}DepartmentId`.replace(/^DepartmentId$/, "departmentId")];
  const account = fieldName.match(/^(.*?)Account(?:Code|Name)$/i);
  if (account) {
    const prefix = account[1];
    return [
      `${prefix}AccountId`.replace(/^AccountId$/, "accountId"),
      `${prefix}GroupAccountId`.replace(/^GroupAccountId$/, "groupAccountId"),
    ];
  }
  const product = fieldName.match(/^(.*?)Product(?:Code|Name|NameSnapshot|CodeSnapshot)$/i);
  if (product) return [`${product[1]}ProductId`.replace(/^ProductId$/, "productId"), `${product[1]}InventoryItemId`.replace(/^InventoryItemId$/, "inventoryItemId")];
  const party = fieldName.match(/^(.*?)(?:Party|Customer|Supplier)(?:Code|Name|NameSnapshot|CodeSnapshot)$/i);
  if (party) return [`${party[1]}PartyId`.replace(/^PartyId$/, "partyId"), `${party[1]}CustomerId`.replace(/^CustomerId$/, "customerId")];
  if (/EmployeeId$/i.test(fieldName)) {
    const prefix = fieldName.slice(0, -"EmployeeId".length);
    return [`${prefix}EmployeeRefId`.replace(/^EmployeeRefId$/, "employeeRefId")];
  }
  return [...targets].map((target) => `${target[0].toLowerCase()}${target.slice(1)}Id`);
}

function unresolvedSchemaCandidates(models) {
  const candidates = [];
  for (const model of models.values()) {
    if (MASTER_MODELS.has(model.name)) continue;
    for (const [fieldName, field] of model.fields) {
      if (!new Set(["String", "Int", "BigInt"]).has(field.type)) continue;
      const targets = identityTarget(fieldName);
      if (!targets) continue;
      if (model.relationSources.has(fieldName)) continue;
      if (GOVERNED_SOURCE_SNAPSHOTS.has(`${model.name}.${fieldName}`)) continue;
      const expectedFields = expectedForeignKeyFields(fieldName, targets);
      const hasMatchingForeignKey = expectedFields.some((candidate) => {
        const target = model.relationSources.get(candidate);
        return target && (targets.has(target) || (targets.has("FinanceAccount") && target === "FinanceGroupAccount") || (targets.has("Party") && target === "ExternalPartyRole"));
      });
      if (hasMatchingForeignKey) continue;
      candidates.push(`${model.name}.${fieldName}`);
    }
  }
  return candidates.sort();
}

function validateGovernedSourceSnapshots(models, errors) {
  for (const [key, snapshot] of GOVERNED_SOURCE_SNAPSHOTS) {
    const [modelName, fieldName] = key.split(".");
    const model = models.get(modelName);
    if (!model?.fields.has(fieldName)) {
      errors.push(`governed source snapshot points to missing ${key}`);
      continue;
    }
    if (!snapshot.reason.trim()) errors.push(`governed source snapshot ${key} requires a reason`);
    if (model.relationSources.get(snapshot.companionField) !== snapshot.companionTarget) {
      errors.push(`governed source snapshot ${key} requires ${modelName}.${snapshot.companionField} -> ${snapshot.companionTarget}`);
    }
  }
}

function validateReferenceContracts(models, errors) {
  const handlerIds = registeredDataReleaseHandlerIds();
  const contractIds = Object.keys(DATA_RELEASE_REFERENCE_CONTRACTS).sort();
  for (const missing of handlerIds.filter((id) => !contractIds.includes(id))) errors.push(`data-release handler ${missing} lacks a reference contract`);
  for (const stale of contractIds.filter((id) => !handlerIds.includes(id))) errors.push(`reference contract ${stale} has no registered data-release handler`);

  for (const [handlerId, contract] of Object.entries(DATA_RELEASE_REFERENCE_CONTRACTS)) {
    const references = contract.references ?? [];
    if (references.length === 0 && !contract.noReferenceFieldsReason?.trim()) {
      errors.push(`${handlerId} must declare references or noReferenceFieldsReason`);
    }
    for (const reference of references) {
      if (!reference.sourceField || !reference.lookup || !reference.destination || !ALLOWED_DISPOSITIONS.has(reference.disposition)) {
        errors.push(`${handlerId} has an invalid reference declaration`);
        continue;
      }
      const [destinationModel, destinationField] = reference.destination.split(".");
      const model = models.get(destinationModel);
      if (!model?.fields.has(destinationField)) {
        errors.push(`${handlerId}.${reference.sourceField} points to missing ${reference.destination}`);
        continue;
      }
      if (reference.disposition === "foreign_key" || reference.disposition === "raw_with_fk") {
        if (!model.relationSources.has(destinationField)) {
          errors.push(`${handlerId}.${reference.sourceField} requires ${reference.destination} to be a Prisma FK`);
        }
      } else {
        const key = `${handlerId}:${reference.sourceField}:${reference.destination}`;
        if (!reference.reason?.trim()) errors.push(`${key} legacy_semantic_key requires a reason`);
        if (!LEGACY_REFERENCE_ALLOWLIST.has(key)) errors.push(`${key} is new legacy semantic-key debt; add a real FK instead`);
      }
    }
  }
}

export function inspectImportReferenceGovernance() {
  const models = parseSchema();
  const errors = [];
  validateReferenceContracts(models, errors);
  validateGovernedSourceSnapshots(models, errors);
  const currentCandidates = unresolvedSchemaCandidates(models);
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")).schemaCandidates;
  for (const candidate of currentCandidates.filter((item) => !baseline.includes(item))) {
    errors.push(`new master-like scalar without FK: ${candidate}`);
  }
  for (const stale of baseline.filter((item) => !currentCandidates.includes(item))) {
    errors.push(`stale legacy baseline entry (remove it after FK migration): ${stale}`);
  }
  return { errors, currentCandidates, handlerCount: registeredDataReleaseHandlerIds().length };
}

export function main(argv = process.argv.slice(2)) {
  const result = inspectImportReferenceGovernance();
  if (argv.includes("--report")) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.errors.length > 0) {
    if (!argv.includes("--report")) result.errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log(`Import reference governance passed (${result.handlerCount} handlers; ${result.currentCandidates.length} ratcheted legacy schema fields).`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
