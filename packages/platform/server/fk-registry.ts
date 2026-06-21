import { matchText } from "@workspace/core/search";

export type LifecycleScope = "active" | "all" | "archived";

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

export type FkTargetPolicy = "block" | "setNull" | "cascade";

export interface ReferenceBlock {
  label: string;
  count: number;
  detail?: string;
}

export interface FkDefinition {
  key: string;
  source: {
    entity: string;
    field: string;
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
  search: (input: { keyword: string; lifecycleScope: LifecycleScope }) => Promise<FkOption[]>;
  resolve: (id: number) => Promise<FkTargetRecord | null>;
}

export interface FkRegistry {
  get(key: string): FkDefinition | null;
  require(key: string): FkDefinition;
  keys(): string[];
}

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

export function createFkRegistry(definitions: FkDefinition[]): FkRegistry {
  const byKey = new Map<string, FkDefinition>();
  for (const definition of definitions) {
    if (byKey.has(definition.key)) {
      throw new Error(`重复注册 FK: ${definition.key}`);
    }
    byKey.set(definition.key, definition);
  }
  return {
    get(key) {
      return byKey.get(key) ?? null;
    },
    require(key) {
      const definition = byKey.get(key);
      if (!definition) throw new Error(`未注册 FK: ${key}`);
      return definition;
    },
    keys() {
      return [...byKey.keys()].sort();
    },
  };
}

export async function searchFkOptions(
  registry: FkRegistry,
  input: { fkKey: string; keyword: string; lifecycleScope?: LifecycleScope },
) {
  const definition = registry.require(input.fkKey);
  const lifecycleScope = input.lifecycleScope ?? definition.defaultLifecycleScope ?? "active";
  return definition.search({ keyword: input.keyword, lifecycleScope });
}

export async function validateFkValue(
  registry: FkRegistry,
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
