#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_TEMPORAL_STORAGE_KINDS,
  createBusinessTemporalCatalog,
  type BusinessTemporalRegistration,
  type BusinessTemporalSource,
} from "@workspace/platform/contracts/business-temporal";
import { RESOURCE_KEYS } from "@workspace/platform/resources";
import { WORKSPACE_BUSINESS_TEMPORAL_REGISTRATIONS } from "./business-temporal-registration-catalog";

type ModelFieldSet = ReadonlyMap<string, ReadonlySet<string>>;

export interface BusinessTemporalRegistryValidationInput {
  registrations: readonly BusinessTemporalRegistration[];
  models: ModelFieldSet;
  resourceKeys: ReadonlySet<string>;
  repositoryRoot: string;
  readFile?: (file: string) => string;
  fileExists?: (file: string) => boolean;
}

export function validateBusinessTemporalRegistry(
  input: BusinessTemporalRegistryValidationInput,
) {
  const errors: string[] = [];
  const catalog = createBusinessTemporalCatalog(input.registrations);
  const authorityOwners = new Map<string, string>();
  const storageKinds = new Set(input.registrations.map((registration) => registration.policy.storage));
  for (const storage of BUSINESS_TEMPORAL_STORAGE_KINDS) {
    if (!storageKinds.has(storage)) errors.push(`缺少 ${storage} 模板样板 registration`);
  }
  for (const registration of catalog.definitions()) {
    if (!input.resourceKeys.has(registration.resourceKey)) {
      errors.push(`${registration.key}: resourceKey ${registration.resourceKey} 未登记`);
    }
    for (const source of [
      ...registration.records.authority,
      ...(registration.records.supplementary ?? []),
    ]) {
      validateSource(registration.key, source, input.models, errors);
    }
    for (const source of registration.records.authority) {
      for (const fieldKey of sourceFieldKeys(source)) {
        const existing = authorityOwners.get(fieldKey);
        if (existing && existing !== registration.key) {
          errors.push(`${registration.key}: authority ${fieldKey} 已由 ${existing} 登记`);
        } else {
          authorityOwners.set(fieldKey, registration.key);
        }
      }
    }
    if (registration.policy.storage === "event-projection" && registration.maturity !== "planned") {
      const projection = registration.projection;
      const projectionFields = projection ? input.models.get(projection.projection) : null;
      if (!projection || !projectionFields) {
        errors.push(`${registration.key}: event projection model 不存在`);
      } else {
        if (!projectionFields.has(projection.sourceEventField)) {
          errors.push(`${registration.key}: ${projection.projection}.${projection.sourceEventField} 缺失`);
        }
        if (!projectionFields.has(projection.generationField)) {
          errors.push(`${registration.key}: ${projection.projection}.${projection.generationField} 缺失`);
        }
        if (!input.models.has(projection.runModel)) {
          errors.push(`${registration.key}: projection run model ${projection.runModel} 缺失`);
        }
      }
    }
    if (registration.maturity === "implemented" && registration.implementation) {
      const moduleFile = path.resolve(input.repositoryRoot, registration.implementation.modulePath);
      const exists = input.fileExists ?? fs.existsSync;
      if (!exists(moduleFile)) {
        errors.push(`${registration.key}: implementation modulePath 不存在: ${registration.implementation.modulePath}`);
      } else {
        const readFile = input.readFile ?? ((file: string) => fs.readFileSync(file, "utf8"));
        const source = readFile(moduleFile);
        if (!source.includes("defineBusinessTemporalModule")) {
          errors.push(`${registration.key}: implemented adapter 必须通过 defineBusinessTemporalModule 绑定`);
        }
        if (!source.includes(registration.implementation.adapterKey)) {
          errors.push(`${registration.key}: implementation 未包含 adapterKey ${registration.implementation.adapterKey}`);
        }
      }
    }
  }
  return {
    errors,
    counts: {
      total: input.registrations.length,
      implemented: input.registrations.filter((item) => item.maturity === "implemented").length,
      partial: input.registrations.filter((item) => item.maturity === "partial").length,
      planned: input.registrations.filter((item) => item.maturity === "planned").length,
    },
  };
}

function validateSource(
  registrationKey: string,
  source: BusinessTemporalSource,
  models: ModelFieldSet,
  errors: string[],
) {
  const modelFields = models.get(source.model);
  if (!modelFields) {
    errors.push(`${registrationKey}: Prisma model ${source.model} 不存在`);
    return;
  }
  const fields = source.kind === "model" ? source.fields : [source.field];
  for (const field of fields) {
    if (!modelFields.has(field)) errors.push(`${registrationKey}: Prisma field ${source.model}.${field} 不存在`);
  }
}

function sourceFieldKeys(source: BusinessTemporalSource) {
  return source.kind === "model"
    ? source.fields.map((field) => `${source.model}.${field}`)
    : [`${source.model}.${source.field}`];
}

export function readPrismaModelFields(repositoryRoot: string): ModelFieldSet {
  const modelDirectory = path.join(repositoryRoot, "prisma/models");
  const models = new Map<string, ReadonlySet<string>>();
  for (const name of fs.readdirSync(modelDirectory).filter((file) => file.endsWith(".prisma")).sort()) {
    const source = fs.readFileSync(path.join(modelDirectory, name), "utf8");
    const modelPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
    for (const match of source.matchAll(modelPattern)) {
      const fields = new Set<string>();
      for (const line of match[2].split("\n")) {
        const field = line.trim().match(/^(\w+)\s+/)?.[1];
        if (field && !field.startsWith("@@")) fields.add(field);
      }
      models.set(match[1], fields);
    }
  }
  return models;
}

export function main(repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")) {
  const result = validateBusinessTemporalRegistry({
    registrations: WORKSPACE_BUSINESS_TEMPORAL_REGISTRATIONS,
    models: readPrismaModelFields(repositoryRoot),
    resourceKeys: new Set(RESOURCE_KEYS),
    repositoryRoot,
  });
  process.stdout.write(
    `Business Temporal registrations: ${result.counts.total} total, ${result.counts.implemented} implemented, ${result.counts.partial} partial, ${result.counts.planned} planned.\n`,
  );
  if (result.errors.length === 0) {
    process.stdout.write("Business Temporal registry check passed.\n");
    return 0;
  }
  process.stderr.write(`${result.errors.map((error) => `- ${error}`).join("\n")}\n`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
