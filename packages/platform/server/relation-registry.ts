import { matchText } from "@workspace/core/search";
import type { PermissionActionKey } from "@workspace/platform/permission-actions";

export type LifecycleScope = "active" | "all" | "archived";
export type RelationUsage = "selector" | "governance" | "both";
export type RelationSemantics = "owned_child" | "hierarchy" | "reference" | "snapshot" | "virtual";

export type RelationPolicyPreset =
  | "block"
  | "confirm_unlink"
  | "confirm_cascade"
  | "confirm_unlink_or_cascade"
  | "auto_cascade_owned"
  | "retain"
  | "exempt_with_reason";

export interface RelationLifecyclePolicies {
  /** null is an explicit report-only migration state, not an executable policy. */
  targetDelete: RelationPolicyPreset | null;
  targetArchive: RelationPolicyPreset | null;
  targetRestore: RelationPolicyPreset | null;
  sourceRelationChange: RelationPolicyPreset | null;
}

export const UNCLASSIFIED_RELATION_LIFECYCLE: RelationLifecyclePolicies = Object.freeze({
  targetDelete: null,
  targetArchive: null,
  targetRestore: null,
  sourceRelationChange: null,
});

export interface RelationPhysicalDefinition {
  sourceModel: string;
  sourceFields: string[];
  targetModel: string;
  targetFields: string[];
}

export type FkLifecycleStatus = "active" | "archived" | "inactive";

export interface FkOption {
  id: number;
  name: string;
  subtitle?: string;
  departmentId?: number | null;
  departmentPath?: string | null;
  lifecycleStatus?: FkLifecycleStatus;
}

export interface FkTargetRecord {
  id: number;
  label: string;
  lifecycleStatus: FkLifecycleStatus;
}

/** Compatibility policy used by guardedDelete; Relation Policy presets are the catalog contract. */
export type FkTargetPolicy = "block" | "setNull" | "cascade";

export interface ReferenceBlock {
  label: string;
  count: number;
  detail?: string;
}

export type FkSearchParams = Record<string, string>;

export interface FkSearchInput {
  keyword: string;
  lifecycleScope: LifecycleScope;
  userId?: number;
  params?: FkSearchParams;
}

export interface RelationDefinition {
  key: string;
  scope: string;
  usage: RelationUsage;
  semantics: RelationSemantics;
  physical?: RelationPhysicalDefinition;
  lifecycle: RelationLifecyclePolicies;
  adapterKey?: string;
  exemptionReason?: string;
}

export interface SelectorRelationDefinition extends RelationDefinition {
  usage: "selector" | "both";
  source: {
    entity: string;
    field: string;
    valueKind?: "id" | "semantic";
  };
  target: {
    entity: string;
    label: string;
  };
  nullable: boolean;
  updatePolicy?: "allowed" | "readonly";
  targetDeletePolicy?: FkTargetPolicy;
  targetArchivePolicy?: FkTargetPolicy;
  defaultLifecycleScope?: LifecycleScope;
  permission: {
    resourceKey: string;
    action: PermissionActionKey;
  };
  search: (input: FkSearchInput) => Promise<FkOption[]>;
  resolve: (id: number) => Promise<FkTargetRecord | null>;
}

export interface RelationCatalog<TDefinition extends RelationDefinition = RelationDefinition> {
  get(key: string): TDefinition | null;
  require(key: string): TDefinition;
  keys(): string[];
  definitions(): TDefinition[];
}

export type SelectorRelationRegistry = RelationCatalog<SelectorRelationDefinition>;
export type FkDefinition = SelectorRelationDefinition;
export type FkRegistry = SelectorRelationRegistry;

export function createRelationCatalog<TDefinition extends RelationDefinition>(
  definitions: TDefinition[],
): RelationCatalog<TDefinition> {
  const byKey = new Map<string, TDefinition>();
  for (const definition of definitions) {
    if (byKey.has(definition.key)) throw new Error(`重复注册 Relation: ${definition.key}`);
    byKey.set(definition.key, definition);
  }
  return {
    get: (key) => byKey.get(key) ?? null,
    require(key) {
      const definition = byKey.get(key);
      if (!definition) throw new Error(`未注册 Relation: ${key}`);
      return definition;
    },
    keys: () => [...byKey.keys()].sort(),
    definitions: () => [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
  };
}

export const createFkRegistry = createRelationCatalog;

export function normalizeLifecycleScope(value: unknown, fallback: LifecycleScope = "active"): LifecycleScope {
  return value === "active" || value === "all" || value === "archived" ? value : fallback;
}

export function matchesFkKeyword(parts: Array<string | null | undefined>, keyword: string) {
  if (!keyword.trim()) return true;
  return parts.some((part) => part && matchText(part, keyword));
}

export function archivedBooleanFilter(scope: LifecycleScope, field = "isArchived") {
  if (scope === "active") return { [field]: false };
  if (scope === "archived") return { [field]: true };
  return {};
}

export function employeeActiveLifecycleStatus(active: boolean): FkLifecycleStatus {
  return active ? "active" : "inactive";
}

export function currentOpenEndedDateWhere<T extends Record<string, unknown>>(extra: T) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...extra,
    OR: [{ endDate: null }, { endDate: "" }, { endDate: { gte: today } }],
  };
}

export async function searchFkOptions(
  registry: SelectorRelationRegistry,
  input: { fkKey: string; keyword: string; lifecycleScope?: LifecycleScope; userId?: number; params?: FkSearchParams },
) {
  const definition = registry.require(input.fkKey);
  const lifecycleScope = input.lifecycleScope ?? definition.defaultLifecycleScope ?? "active";
  return definition.search({ keyword: input.keyword, lifecycleScope, userId: input.userId, params: input.params });
}

export async function validateFkValue(
  registry: SelectorRelationRegistry,
  input: { fkKey: string; value: unknown; lifecycleScope?: LifecycleScope; requiredLabel?: string },
): Promise<{ ok: true; value: number | null; target: FkTargetRecord | null } | { ok: false; error: string; status?: number }> {
  const definition = registry.require(input.fkKey);
  const targetLabel = input.requiredLabel || definition.target.label;
  if (input.value === null || input.value === undefined || input.value === "") {
    if (definition.nullable) return { ok: true, value: null, target: null };
    return { ok: false, error: `该字段不能为空，请先选择有效的 ${targetLabel}。`, status: 400 };
  }

  const id = typeof input.value === "number" ? input.value : Number(input.value);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: `${targetLabel}无效`, status: 400 };

  const target = await definition.resolve(id);
  if (!target) return { ok: false, error: `${targetLabel}不存在`, status: 404 };

  const lifecycleScope = input.lifecycleScope ?? definition.defaultLifecycleScope ?? "active";
  if (lifecycleScope === "active" && target.lifecycleStatus !== "active") {
    return { ok: false, error: `${targetLabel}已归档或不再现用，不能选择`, status: 400 };
  }
  if (lifecycleScope === "archived" && target.lifecycleStatus === "active") {
    return { ok: false, error: `${targetLabel}仍为现用，不能作为归档对象选择`, status: 400 };
  }

  return { ok: true, value: id, target };
}

export function formatReferenceBlockMessage(actionLabel: string, blocks: ReferenceBlock[]) {
  const activeBlocks = blocks.filter((block) => block.count > 0);
  if (activeBlocks.length === 0) return null;
  const details = activeBlocks.map((block) => `${block.label} ${block.count} 条`).join("、");
  return `不能${actionLabel}，请先处理现用引用：${details}`;
}
