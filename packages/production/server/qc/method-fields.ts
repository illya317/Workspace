import "server-only";
import path from "path";
import { readdir, readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { asArray, asRecord, asString } from "./layout-block-utils";
import type { QcTemplateMethodField, QcTemplateMethodGroup } from "./types";

type MethodIndex = Record<string, { fileName: string; definition: unknown }>;
type MethodFieldDraft = Omit<QcTemplateMethodField, "fieldKey">;
type MethodGroupDraft = { name: string; fields: MethodFieldDraft[] };

function maybeString(value: unknown) {
  const str = asString(value);
  return str || undefined;
}

async function readYamlFile(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, "utf8");
  return parseYaml(text, { uniqueKeys: false });
}

async function listYamlFiles(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

export async function loadQcMethods(configRoot: string): Promise<MethodIndex> {
  const files = await listYamlFiles(path.join(configRoot, "methods"));
  const pairs = await Promise.all(files.map(async (filePath) => {
    const methods = asRecord(asRecord(await readYamlFile(filePath)).methods);
    return Object.entries(methods).map(([name, definition]) => [
      name,
      { fileName: path.basename(filePath), definition },
    ] as const);
  }));
  return Object.fromEntries(pairs.flat());
}

function expandTemplateText(value: unknown, index: number) {
  return typeof value === "string" ? value.replaceAll("{序号}", String(index)) : value;
}

function flattenFields(group: string, value: unknown): MethodFieldDraft[] {
  return asArray(value).flatMap((item) => {
    const field = asRecord(item);
    const repeat = asRecord(field.repeat);
    if (Array.isArray(repeat.fields)) {
      const count = Number(repeat.count) || 1;
      const repeatFields = asArray(repeat.fields);
      return Array.from({ length: Math.max(1, count) }, (_, index) => index + 1)
        .flatMap((rowNo) => flattenFields(group, repeatFields.map((child) => {
          const data = asRecord(child);
          return {
            ...data,
            name: expandTemplateText(data.name, rowNo),
            formula: expandTemplateText(data.formula, rowNo),
            rule: expandTemplateText(data.rule, rowNo),
          };
        })));
    }
    const name = asString(field.name);
    if (!name) return [];
    return [{
      name,
      group,
      type: asString(field.type) || undefined,
      attr: asString(field.attr) || undefined,
      unit: asString(field.unit) || undefined,
      formula: asString(field.formula) || undefined,
      rule: asString(field.rule) || undefined,
      options: asArray(field.options).map((option) => asString(option)).filter(Boolean),
      defaultValue: maybeString(field.default ?? field.value),
    }];
  });
}

function groupsFromDefinition(methodName: string, definition: unknown): MethodGroupDraft[] {
  if (Array.isArray(definition)) {
    const fields = flattenFields(methodName, definition);
    return fields.length ? [{ name: methodName, fields }] : [];
  }
  return Object.entries(asRecord(definition))
    .filter(([name]) => !["extends", "extra", "render_as"].includes(name))
    .flatMap(([name, value]) => {
      const fields = Array.isArray(value) ? flattenFields(name, value) : [];
      return fields.length ? [{ name, fields }] : [];
    });
}

function withFieldKeys(
  groups: MethodGroupDraft[],
  stageKey: string,
  testNameEn: string,
): QcTemplateMethodGroup[] {
  const seen = new Set<string>();
  return groups.map((group, groupIndex) => ({
    ...group,
    fields: group.fields.map((field) => {
      const baseKey = `${stageKey}/${testNameEn}/s${groupIndex}/${field.name}`;
      let fieldKey = baseKey;
      let suffix = 2;
      while (seen.has(fieldKey)) {
        fieldKey = `${baseKey}_${suffix}`;
        suffix += 1;
      }
      seen.add(fieldKey);
      return { ...field, fieldKey };
    }),
  }));
}

export function buildQcMethodGroups(
  methodName: string,
  methods: MethodIndex,
  stageKey: string,
  testNameEn: string,
): { fileName?: string; groups: QcTemplateMethodGroup[] } {
  const method = methods[methodName] ?? methods[methodName.split("-")[0]];
  if (!method) return { groups: [] };
  const methodDefinition = asRecord(method.definition);
  const base = methods[asString(methodDefinition.extends)];
  const groups = [
    ...(base ? groupsFromDefinition(asString(methodDefinition.extends), base.definition) : []),
    ...groupsFromDefinition(methodName, method.definition),
  ];
  const extra = flattenFields("扩展", methodDefinition.extra);
  const allGroups = extra.length ? [...groups, { name: "扩展", fields: extra }] : groups;
  return { fileName: method.fileName, groups: withFieldKeys(allGroups, stageKey, testNameEn) };
}
