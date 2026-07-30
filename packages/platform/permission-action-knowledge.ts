import {
  PERMISSION_ACTION_REGISTRY,
  getPermissionRegistryActionClosure,
  type PermissionRegistryActionKey,
} from "./action-registry";
import {
  listBusinessActionRegistrations,
  type BusinessActionRegistration,
} from "./business-action-registry";
import { activeWorkspacePackages } from "./modules";
import {
  PERMISSION_RESOURCE_ACTION_POLICIES,
  type PermissionResourceActionPolicy,
} from "./permission-resource-policy";
import { RESOURCE_DEFS } from "./resources";
import { isHighRiskPermissionAction } from "./permission-review-policy";
import { defaultResourceActionAllows } from "./permission-default-actions";

export const PERMISSION_ACTION_KNOWLEDGE_SCHEMA_VERSION = "1";

export const PERMISSION_ACTION_KNOWLEDGE_SOURCE_FILES = [
  "packages/platform/action-registry.ts",
  "packages/platform/permission-resource-policy.ts",
  "packages/platform/permission-default-actions.ts",
  "packages/platform/module-registry.ts",
  "packages/platform/business-action-registry.ts",
] as const;

export type PermissionActionKnowledgeRisk = "basic" | "high";
export type PermissionActionKnowledgeGrantMode = "system_default" | "explicit" | "ancestor_inherited" | "derived";
export type PermissionActionKnowledgeBindingRole = "direct" | "workflow_submit" | "workflow_process";

export type PermissionActionKnowledgeBinding = {
  role: PermissionActionKnowledgeBindingRole;
  roleLabel: string;
  businessActionKey: string;
  label: string;
  writeKind: BusinessActionRegistration["writeKind"];
  targetKind: string;
  eligibility: BusinessActionRegistration["eligibility"];
  flowType: BusinessActionRegistration["flowType"] | null;
  separationPolicy: BusinessActionRegistration["separationPolicy"] | null;
  routes: Array<{ method: string; path: string; notes: string | null }>;
  notes: string | null;
};

export type PermissionActionKnowledgeEntry = {
  key: string;
  resourceKey: string;
  actionKey: PermissionRegistryActionKey;
  label: string;
  meaning: string;
  risk: PermissionActionKnowledgeRisk;
  impliedActions: PermissionRegistryActionKey[];
  grantMode: PermissionActionKnowledgeGrantMode;
  grantDescription: string;
  recommendedHolders: string | null;
  bindingCoverage: "registered" | "guard_only" | "unregistered_high_risk";
  bindings: PermissionActionKnowledgeBinding[];
};

export type PermissionActionKnowledgeResource = {
  key: string;
  name: string;
  status: PermissionResourceActionPolicy["status"];
  statusLabel: string;
  derived: boolean;
  moduleKey: string;
  moduleLabel: string;
  href: string | null;
  ownerKey: string | null;
  scopeTypes: string[];
  scopeInheritanceMode: PermissionResourceActionPolicy["scopeInheritanceMode"] | null;
  notes: string | null;
  supportedActions: PermissionRegistryActionKey[];
  permissionKeys: string[];
};

export type PermissionActionKnowledge = {
  schemaVersion: string;
  sourceFiles: readonly string[];
  summary: {
    actionCount: number;
    resourceCount: number;
    permissionCount: number;
    businessActionCount: number;
  };
  actions: Array<{
    key: PermissionRegistryActionKey;
    label: string;
    group: string;
    meaning: string;
    risk: PermissionActionKnowledgeRisk;
    impliedActions: PermissionRegistryActionKey[];
    notes: string | null;
  }>;
  resources: PermissionActionKnowledgeResource[];
  permissions: PermissionActionKnowledgeEntry[];
};

export type PermissionActionKnowledgeQuery = {
  permissionKey?: string;
  resourceKey?: string;
  actionKey?: PermissionRegistryActionKey;
  businessActionKey?: string;
  route?: string;
  q?: string;
  offset?: number;
  limit?: number;
};

const ACTION_MEANINGS: Record<PermissionRegistryActionKey, string> = {
  entry: "进入资源对应的页面、菜单或功能入口。",
  read: "查看该资源允许暴露的列表、详情和只读数据；对象范围仍由 service 与 scope 限制。",
  create: "创建该资源中的新记录或业务草稿。",
  update: "修改该资源中已经存在且当前状态允许编辑的记录。",
  delete: "删除记录；可能是硬删除，也可能由具体业务动作定义为受控删除，不能理解成编辑权限。",
  archive: "归档或反归档仍需保留的历史事实，不等于删除。",
  revise: "对已生效、已提交或有历史版本的对象进行受控修订、重开或更正。",
  reverse: "撤销、作废、冲销或执行反向业务处理；具体结果必须看资源内的业务动作。",
  lock: "关闭期间、批次或写入窗口，阻止后续普通写入。",
  unlock: "重新打开期间、批次或写入窗口。",
  submit: "提交、确认或发起业务流程；不代表有权处理或通过该流程。",
  approve: "对该资源执行通过、复核、启用、发布或关闭等生效决策；必须结合完整 resource.action 和下方业务绑定理解。",
  reject: "驳回流程或业务申请；approve 不会自动包含 reject。",
  import: "导入、摄取或批量确认外部数据；默认不自动包含 create/update。",
  export: "导出、下载、打印或对外发送该资源数据。",
  apiUse: "通过集成 API 使用该资源能力；默认不自动包含业务读写。",
  share: "把单条记录共享给其他主体或建立临时协作访问。",
  grant: "管理其他用户、岗位或部门在该资源上的授权；不是业务数据管理员权限。",
  configure: "修改规则、流程或系统配置；默认不自动包含业务数据读写。",
  audit: "查看审计、变更或权限台账；默认不自动包含业务数据读写。",
};

const RECOMMENDED_HOLDERS: Partial<Record<string, string>> = {
  "work.tasks.approve": "目标、计划、汇报或协作事项的实际审批责任人；避免同时给同一对象的提交人与审批人。",
  "work.projects.approve": "项目发起流程中对应赋能部门的负责人或正式审批人。",
  "work.meetings.approve": "被授权关闭表决并形成结果的会议治理责任人。",
  "hr.roster.approve": "组织、人事资料审批责任人。",
  "hr.performance.approve": "绩效流程的正式审批责任人。",
  "finance.ledger.approve": "集团科目或总账治理的复核责任人。",
  "finance.statements.approve": "合并抵销、合并批次复核与报表发布责任人。",
  "finance.budget.approve": "有权启用预算版本的预算负责人。",
  "production.qc.approve": "QC 独立复核人员；不应由同一批次的填报人兼任。",
  "inventory.receipts.approve": "财务复核人员；可同时具备制表资格，但不得复核本人制表的单据。",
  "docs.editor.approve": "对应组织空间内的模板审批或发布责任人。",
};

const STATUS_LABELS: Record<PermissionResourceActionPolicy["status"], string> = {
  container: "容器资源",
  business: "业务资源",
  capability: "独立 capability",
  headless: "无页面运行资源",
  docs: "文档资源",
  planned: "规划中资源",
};

type ResourceDisplay = {
  name: string;
  href: string | null;
  moduleKey: string;
  moduleLabel: string;
  ownerKey: string | null;
};

type BindingCandidate = {
  registration: BusinessActionRegistration;
  role: PermissionActionKnowledgeBindingRole;
};

const BINDING_ROLE_RANK: Record<PermissionActionKnowledgeBindingRole, number> = {
  direct: 0,
  workflow_submit: 1,
  workflow_process: 2,
};

function isDerivedResource(resourceKey: string) {
  return resourceKey.startsWith("space.") || resourceKey.startsWith("settings.admin.workflow.");
}

function resourceDisplays() {
  const resourceDefMap = new Map(RESOURCE_DEFS.map((resource) => [resource.key, resource]));
  const result = new Map<string, ResourceDisplay>();

  for (const pkg of activeWorkspacePackages) {
    const moduleDef = pkg.moduleDef;
    if (!moduleDef?.resourceKey) continue;
    result.set(moduleDef.resourceKey, {
      name: moduleDef.label,
      href: moduleDef.presentation === "headless" ? null : moduleDef.href,
      moduleKey: moduleDef.key,
      moduleLabel: moduleDef.label,
      ownerKey: null,
    });
    for (const child of moduleDef.children ?? []) {
      result.set(child.resourceKey, {
        name: child.label,
        href: child.href,
        moduleKey: moduleDef.key,
        moduleLabel: moduleDef.label,
        ownerKey: null,
      });
    }
  }

  for (const resource of RESOURCE_DEFS) {
    if (result.has(resource.key)) continue;
    const owner = resource.capabilityOwnerKey ?? resource.parentKey ?? null;
    const ownerDisplay = owner ? result.get(owner) : null;
    const moduleKey = ownerDisplay?.moduleKey ?? resource.key.split(".")[0] ?? "other";
    result.set(resource.key, {
      name: resource.name,
      href: ownerDisplay?.href ?? null,
      moduleKey,
      moduleLabel: ownerDisplay?.moduleLabel ?? moduleKey,
      ownerKey: owner,
    });
  }

  for (const policy of PERMISSION_RESOURCE_ACTION_POLICIES) {
    if (result.has(policy.resourceKey)) continue;
    const moduleKey = policy.resourceKey.split(".")[0] ?? "other";
    result.set(policy.resourceKey, {
      name: policy.resourceKey,
      href: null,
      moduleKey,
      moduleLabel: moduleKey === "space" ? "空间权限" : moduleKey,
      ownerKey: resourceDefMap.get(policy.resourceKey)?.capabilityOwnerKey ?? null,
    });
  }
  return result;
}

function actionBindings() {
  const result = new Map<string, BindingCandidate[]>();
  const push = (resourceKey: string, actionKey: string | undefined, binding: BindingCandidate) => {
    if (!actionKey) return;
    const key = `${resourceKey}.${actionKey}`;
    result.set(key, [...result.get(key) ?? [], binding]);
  };

  for (const registration of listBusinessActionRegistrations()) {
    push(registration.resourceKey, registration.directPermissionAction, { registration, role: "direct" });
    push(registration.resourceKey, registration.submitPermissionAction, { registration, role: "workflow_submit" });
    push(registration.resourceKey, registration.processPermissionAction, { registration, role: "workflow_process" });
  }
  return result;
}

function bindingRecord(binding: BindingCandidate): PermissionActionKnowledgeBinding {
  const roleLabels: Record<PermissionActionKnowledgeBindingRole, string> = {
    direct: "直接执行",
    workflow_submit: "流程发起资格",
    workflow_process: "流程处理资格",
  };
  return {
    role: binding.role,
    roleLabel: roleLabels[binding.role],
    businessActionKey: binding.registration.key,
    label: binding.registration.label,
    writeKind: binding.registration.writeKind,
    targetKind: binding.registration.targetKind,
    eligibility: binding.registration.eligibility,
    flowType: binding.registration.flowType ?? null,
    separationPolicy: binding.registration.separationPolicy ?? null,
    routes: (binding.registration.apiRoutes ?? []).map((route) => ({
      method: route.method,
      path: route.path,
      notes: route.notes ?? null,
    })),
    notes: binding.registration.notes ?? null,
  };
}

function grantRecord(policy: PermissionResourceActionPolicy, actionKey: PermissionRegistryActionKey) {
  if (defaultResourceActionAllows(policy.resourceKey, actionKey)) {
    return {
      mode: "system_default" as const,
      description: "系统默认授予所有登录用户，无需显式配置；不代表匿名公开。",
    };
  }
  if (policy.explicitOnlyActions.includes(actionKey)) {
    return {
      mode: "explicit" as const,
      description: "当前资源显式配置；不从父资源继承。可授予用户、岗位或部门。",
    };
  }
  if (policy.ancestorInheritedActions.includes(actionKey)) {
    return {
      mode: "ancestor_inherited" as const,
      description: "可在当前资源配置，也可能从父资源继承。",
    };
  }
  return {
    mode: "derived" as const,
    description: "当前资源配置或由系统规则派生；不从父资源继承。",
  };
}

function actionRisk(actionKey: PermissionRegistryActionKey): PermissionActionKnowledgeRisk {
  return isHighRiskPermissionAction(actionKey) ? "high" : "basic";
}

export function buildPermissionActionKnowledge(): PermissionActionKnowledge {
  const displays = resourceDisplays();
  const bindingsByPermission = actionBindings();
  const policies = [...PERMISSION_RESOURCE_ACTION_POLICIES]
    .sort((left, right) => left.resourceKey.localeCompare(right.resourceKey));
  const permissions: PermissionActionKnowledgeEntry[] = [];

  const resources = policies.map((policy): PermissionActionKnowledgeResource => {
    const display = displays.get(policy.resourceKey)!;
    const permissionKeys: string[] = [];
    for (const actionKey of policy.supportedActions) {
      const key = `${policy.resourceKey}.${actionKey}`;
      const bindingCandidates = bindingsByPermission.get(key) ?? [];
      const bindings = [...new Map([...bindingCandidates]
        .sort((left, right) => BINDING_ROLE_RANK[left.role] - BINDING_ROLE_RANK[right.role])
        .map((binding) => [
          `${binding.role}:${binding.registration.key}`,
          bindingRecord(binding),
        ])).values()];
      const risk = actionRisk(actionKey);
      const grant = grantRecord(policy, actionKey);
      permissionKeys.push(key);
      permissions.push({
        key,
        resourceKey: policy.resourceKey,
        actionKey,
        label: PERMISSION_ACTION_REGISTRY.find((action) => action.key === actionKey)?.label ?? actionKey,
        meaning: ACTION_MEANINGS[actionKey],
        risk,
        impliedActions: getPermissionRegistryActionClosure([actionKey]).filter((item) => item !== actionKey),
        grantMode: grant.mode,
        grantDescription: grant.description,
        recommendedHolders: actionKey === "approve"
          ? RECOMMENDED_HOLDERS[key] ?? "该资源的正式审批/复核责任人；需结合对象范围和职责分离配置。"
          : null,
        bindingCoverage: bindings.length > 0 ? "registered" : risk === "high" ? "unregistered_high_risk" : "guard_only",
        bindings,
      });
    }
    return {
      key: policy.resourceKey,
      name: display.name,
      status: policy.status,
      statusLabel: STATUS_LABELS[policy.status],
      derived: isDerivedResource(policy.resourceKey),
      moduleKey: display.moduleKey,
      moduleLabel: display.moduleLabel,
      href: display.href,
      ownerKey: display.ownerKey,
      scopeTypes: [...policy.scopeTypes ?? []],
      scopeInheritanceMode: policy.scopeInheritanceMode ?? null,
      notes: policy.notes ?? null,
      supportedActions: [...policy.supportedActions],
      permissionKeys,
    };
  });

  const actions = PERMISSION_ACTION_REGISTRY.map((action) => {
    const actionKey = action.key as PermissionRegistryActionKey;
    return {
      key: actionKey,
      label: action.label,
      group: action.group,
      meaning: ACTION_MEANINGS[actionKey],
      risk: actionRisk(actionKey),
      impliedActions: getPermissionRegistryActionClosure([actionKey]).filter((item) => item !== actionKey),
      notes: action.notes ?? null,
    };
  });

  return {
    schemaVersion: PERMISSION_ACTION_KNOWLEDGE_SCHEMA_VERSION,
    sourceFiles: PERMISSION_ACTION_KNOWLEDGE_SOURCE_FILES,
    summary: {
      actionCount: actions.length,
      resourceCount: resources.length,
      permissionCount: permissions.length,
      businessActionCount: listBusinessActionRegistrations().length,
    },
    actions,
    resources,
    permissions,
  };
}

function normalizedRoute(value: string) {
  const pathname = value.split(/[?#]/, 1)[0] || "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/g, "") : pathname;
}

function routeMatches(pattern: string, requestedRoute: string) {
  const patternSegments = normalizedRoute(pattern).split("/");
  const requestedSegments = normalizedRoute(requestedRoute).split("/");
  return patternSegments.length === requestedSegments.length && patternSegments.every((segment, index) => (
    segment.startsWith(":") || /^\[[^\]]+\]$/.test(segment) || segment === requestedSegments[index]
  ));
}

function searchableText(entry: PermissionActionKnowledgeEntry, resource: PermissionActionKnowledgeResource) {
  return [
    entry.key,
    entry.resourceKey,
    entry.actionKey,
    entry.label,
    entry.meaning,
    entry.recommendedHolders,
    resource.name,
    resource.moduleLabel,
    resource.notes,
    ...entry.bindings.flatMap((binding) => [
      binding.businessActionKey,
      binding.label,
      binding.notes,
      ...binding.routes.flatMap((route) => [route.method, route.path, route.notes]),
    ]),
  ].filter(Boolean).join("\n").toLocaleLowerCase("zh-CN");
}

export function queryPermissionActionKnowledge(
  query: PermissionActionKnowledgeQuery,
  knowledge = buildPermissionActionKnowledge(),
) {
  const normalizedQuery = {
    permissionKey: query.permissionKey?.trim() || undefined,
    resourceKey: query.resourceKey?.trim() || undefined,
    actionKey: query.actionKey?.trim() || undefined,
    businessActionKey: query.businessActionKey?.trim() || undefined,
    route: query.route?.trim() || undefined,
    q: query.q?.trim() || undefined,
    offset: Math.max(0, query.offset ?? 0),
    limit: Math.min(200, Math.max(1, query.limit ?? 50)),
  };
  const resourceByKey = new Map(knowledge.resources.map((resource) => [resource.key, resource]));
  const filtered = knowledge.permissions.filter((entry) => {
    if (normalizedQuery.permissionKey && entry.key !== normalizedQuery.permissionKey) return false;
    if (normalizedQuery.resourceKey && entry.resourceKey !== normalizedQuery.resourceKey) return false;
    if (normalizedQuery.actionKey && entry.actionKey !== normalizedQuery.actionKey) return false;
    if (normalizedQuery.businessActionKey && !entry.bindings.some((binding) => binding.businessActionKey === normalizedQuery.businessActionKey)) return false;
    if (normalizedQuery.route && !entry.bindings.some((binding) => binding.routes.some((route) => routeMatches(route.path, normalizedQuery.route!)))) return false;
    if (normalizedQuery.q) {
      const resource = resourceByKey.get(entry.resourceKey)!;
      if (!searchableText(entry, resource).includes(normalizedQuery.q.toLocaleLowerCase("zh-CN"))) return false;
    }
    return true;
  });
  const permissions = filtered.slice(normalizedQuery.offset, normalizedQuery.offset + normalizedQuery.limit);
  const returnedResourceKeys = new Set(permissions.map((entry) => entry.resourceKey));
  const nextOffset = normalizedQuery.offset + permissions.length < filtered.length
    ? normalizedQuery.offset + permissions.length
    : null;

  return {
    schemaVersion: knowledge.schemaVersion,
    sourceFiles: knowledge.sourceFiles,
    summary: knowledge.summary,
    query: normalizedQuery,
    total: filtered.length,
    returned: permissions.length,
    truncated: nextOffset !== null,
    nextOffset,
    queryCapabilities: {
      exactFilters: ["permissionKey", "resourceKey", "actionKey", "businessActionKey"] as const,
      routeFilter: "Matches registered route templates and concrete dynamic segments.",
      textFilter: "q searches permission, resource, BusinessAction and route text.",
      maxLimit: 200,
    },
    actions: knowledge.actions,
    resources: knowledge.resources.filter((resource) => returnedResourceKeys.has(resource.key)),
    permissions,
  };
}
