import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export interface DmmfFieldLike {
  name: string;
  kind: string;
  type: string;
  relationName?: string;
  relationFromFields?: string[];
  relationToFields?: string[];
  relationOnDelete?: string;
}

export interface DmmfModelLike {
  name: string;
  fields: DmmfFieldLike[];
}

export interface DmmfDatamodelLike {
  models: DmmfModelLike[];
}

export interface PrismaSchemaMetadata {
  modelFiles: Map<string, string>;
  onDeleteByRelationField: Map<string, string>;
}

const STATIC_DATASOURCE_URL = "postgresql://relation_policy_static:unused@127.0.0.1:1/relation_policy_static";

export function prismaDmmfEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  return {
    ...environment,
    DATABASE_URL: STATIC_DATASOURCE_URL,
    DIRECT_URL: STATIC_DATASOURCE_URL,
    SHADOW_DATABASE_URL: STATIC_DATASOURCE_URL,
  };
}

function prismaFiles(schemaRoot: string) {
  const files = [path.join(schemaRoot, "schema.prisma")];
  const modelsRoot = path.join(schemaRoot, "models");
  if (fs.existsSync(modelsRoot)) {
    files.push(...fs.readdirSync(modelsRoot)
      .filter((entry) => entry.endsWith(".prisma"))
      .sort()
      .map((entry) => path.join(modelsRoot, entry)));
  }
  return files;
}

export function readPrismaSchemaMetadata(schemaRoot: string): PrismaSchemaMetadata {
  const modelFiles = new Map<string, string>();
  const onDeleteByRelationField = new Map<string, string>();

  for (const filePath of prismaFiles(schemaRoot)) {
    const source = fs.readFileSync(filePath, "utf8");
    const modelPattern = /\bmodel\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    for (const match of source.matchAll(modelPattern)) {
      const modelName = match[1];
      const body = match[2] ?? "";
      if (!modelName) continue;
      modelFiles.set(modelName, path.basename(filePath));
      for (const line of body.split("\n")) {
        if (!line.includes("@relation") || !line.includes("fields:")) continue;
        const fieldName = line.trim().match(/^(\w+)\s+/)?.[1];
        if (!fieldName) continue;
        const onDelete = line.match(/\bonDelete\s*:\s*(\w+)/)?.[1] ?? "Default";
        onDeleteByRelationField.set(`${modelName}.${fieldName}`, onDelete);
      }
    }
  }

  return { modelFiles, onDeleteByRelationField };
}

function copyPrismaSchema(sourceRoot: string, destinationRoot: string) {
  fs.copyFileSync(path.join(sourceRoot, "schema.prisma"), path.join(destinationRoot, "schema.prisma"));
  const sourceModels = path.join(sourceRoot, "models");
  if (fs.existsSync(sourceModels)) fs.cpSync(sourceModels, path.join(destinationRoot, "models"), { recursive: true });
}

export function loadPrismaDmmf(repositoryRoot: string): DmmfDatamodelLike {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-relation-dmmf-"));
  const schemaRoot = path.join(temporaryRoot, "prisma");
  const outputPath = path.join(temporaryRoot, "dmmf.json");
  fs.mkdirSync(schemaRoot);

  try {
    copyPrismaSchema(path.join(repositoryRoot, "prisma"), schemaRoot);
    const generatorPath = path.join(repositoryRoot, "scripts", "check", "relation-dmmf-generator.mjs");
    fs.appendFileSync(path.join(schemaRoot, "schema.prisma"), [
      "",
      "generator relationCatalogDmmf {",
      `  provider = \"node ${generatorPath}\"`,
      "  output   = \"./relation-catalog-dmmf\"",
      "}",
      "",
    ].join("\n"));

    const prismaBinary = path.join(repositoryRoot, "node_modules", ".bin", "prisma");
    const result = spawnSync(prismaBinary, [
      "generate",
      `--schema=${schemaRoot}`,
      "--generator=relationCatalogDmmf",
    ], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...prismaDmmfEnvironment(), RELATION_DMMF_OUTPUT: outputPath },
    });
    if (result.status !== 0 || !fs.existsSync(outputPath)) {
      const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      throw new Error(`Unable to generate Prisma DMMF${detail ? `:\n${detail}` : ""}`);
    }
    return JSON.parse(fs.readFileSync(outputPath, "utf8")) as DmmfDatamodelLike;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
