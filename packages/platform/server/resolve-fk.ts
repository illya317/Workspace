import type { FkDefinition } from "./fk-registry";
import { WORKSPACE_FK_REGISTRY } from "./fk-registrations";

export interface ResolveFkOptions {
  entityType?: string;
}

function displayKey(entity: string, field: string, value: number) {
  return `${entity}:${field}:${value}`;
}

function fallbackDisplayKey(field: string, value: number) {
  return `field:${field}:${value}`;
}

function definitionsForField(field: string, entityType?: string): FkDefinition[] {
  const definitions = WORKSPACE_FK_REGISTRY.keys()
    .map((key) => WORKSPACE_FK_REGISTRY.require(key))
    .filter((definition) => definition.source.field === field && (definition.source.valueKind ?? "id") === "id");
  if (!entityType) return definitions;
  return definitions.filter((definition) => definition.source.entity === entityType || definition.source.entity === "Any");
}

function hasSingleTarget(definitions: FkDefinition[]) {
  return new Set(definitions.map((definition) => definition.target.entity)).size === 1;
}

function displayCandidates(field: string, value: number, entityType?: string) {
  const candidates = entityType
    ? [displayKey(entityType, field, value), displayKey("Any", field, value)]
    : [fallbackDisplayKey(field, value)];
  return candidates;
}

/** Resolve FK ids found in data rows into display names. */
export async function resolveFkValues(
  rows: Record<string, unknown>[],
  options: ResolveFkOptions = {},
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const fields = new Set(rows.flatMap((row) => Object.keys(row)));

  await Promise.all(
    [...fields].flatMap((field) =>
      definitionsForField(field, options.entityType).map(async (definition, _index, definitions) => {
        const ids = Array.from(
          new Set(
            rows
              .map((row) => row[field])
              .filter((value): value is number | string => value != null && typeof value !== "object")
              .map(Number),
          ),
        ).filter((id) => Number.isInteger(id) && id > 0);
        if (ids.length === 0) return;

        await Promise.all(ids.map(async (id) => {
          try {
            const target = await definition.resolve(id);
            if (target) {
              map[displayKey(definition.source.entity, field, id)] = target.label;
              if (hasSingleTarget(definitions)) map[fallbackDisplayKey(field, id)] = target.label;
            }
          } catch {
            // FK display is best-effort; callers still show the raw value.
          }
        }));
      }),
    ),
  );

  return map;
}

/** Convert one FK field value into its resolved display name when available. */
export function fkDisplay(
  field: string,
  value: string,
  fkMap: Record<string, string>,
  options: ResolveFkOptions = {},
): string {
  if (!/^\d+$/.test(value)) return value;
  const id = Number(value);
  for (const key of displayCandidates(field, id, options.entityType)) {
    const resolved = fkMap[key];
    if (resolved) return resolved;
  }
  return value;
}
