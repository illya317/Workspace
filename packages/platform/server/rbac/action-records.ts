import {
  PERMISSION_ACTION_DEFS,
  PERMISSION_GROUP_DEFS,
  actionImplies,
  getPermissionActionLabel,
  roleKeyToActionKey,
  type PermissionActionKey,
  type PermissionActionSource,
  type PermissionGroupKey,
} from "@workspace/platform/permission-actions";
import {
  canPermissionActionInheritFromAncestor,
  canPermissionResourceInheritGlobalScope,
  isPermissionActionSupported,
} from "@workspace/platform/permission-resource-policy";
import type { SubjectType } from "./grants";
import type { ActionGrantItem } from "./action-grants";

export interface PermissionRecordSubject {
  id: number;
  name: string;
  extra?: Record<string, unknown>;
}

export interface LegacyGrantItem {
  subjectId: number;
  resourceKey: string;
  roleKey: string;
  scopeId: string | null;
  source?: PermissionActionSource;
}

type ActionGrantWithSource = ActionGrantItem & { source?: PermissionActionSource };

export interface PermissionActionState {
  actionKey: PermissionActionKey;
  label: string;
  has: boolean;
  source: PermissionActionSource | null;
  sourceActionKey: PermissionActionKey | null;
  sourceResourceKey: string | null;
  directGrantable: boolean;
  pendingResourceMapping: boolean;
}

export interface PermissionSummaryItem {
  label: string;
  source: PermissionActionSource | null;
  actionKeys: PermissionActionKey[];
}

export interface PermissionRecordSummary {
  basicSummary: PermissionSummaryItem | null;
  workflowSummary: PermissionSummaryItem | null;
  lifecycleSummary: PermissionSummaryItem | null;
  exchangeSummary: PermissionSummaryItem | null;
  adminSummary: PermissionSummaryItem | null;
  riskSummary: PermissionSummaryItem | null;
}

export interface PermissionActionTreeGroup {
  key: PermissionGroupKey;
  label: string;
  actions: PermissionActionState[];
}

export interface PermissionRecord extends PermissionRecordSummary {
  subjectId: number;
  actionStates: Record<PermissionActionKey, PermissionActionState>;
  actionTree: PermissionActionTreeGroup[];
}

interface BuildPermissionRecordsInput {
  subjects: PermissionRecordSubject[];
  subjectType: SubjectType;
  selectedResource: string | null;
  ancestorResourceKeys: string[];
  directGrants: LegacyGrantItem[];
  positionGrants: LegacyGrantItem[];
  departmentGrants: LegacyGrantItem[];
  implicitGrants: LegacyGrantItem[];
  directActionGrants: ActionGrantWithSource[];
  positionActionGrants: ActionGrantWithSource[];
  departmentActionGrants: ActionGrantWithSource[];
  childResourceKeys?: string[];
  selectedScopeId?: string | null;
}

const ACTION_LEVEL: Record<PermissionActionKey, number> = {
  access: 0,
  export: 0,
  create: 1,
  write: 1,
  archive: 1,
  revise: 1,
  submit: 1,
  withdraw: 1,
  approve: 1,
  reject: 1,
  import: 1,
  delete: 2,
  admin: 3,
};

const MAX_ROLE_LEVEL: Record<string, number> = { access: 0, write: 1, delete: 2, admin: 3 };

export function isPermissionActionAllowedByMaxRole(actionKey: PermissionActionKey, maxRoleKey: string, isSystemAdmin: boolean) {
  if (actionKey === "admin") return isSystemAdmin;
  return ACTION_LEVEL[actionKey] <= (MAX_ROLE_LEVEL[maxRoleKey] ?? 3);
}

function isPendingResourceMapping(resourceKey: string | null, actionKey: PermissionActionKey) {
  return Boolean(resourceKey && !isPermissionActionSupported(resourceKey, actionKey));
}

function isActionVisibleForResource(resourceKey: string | null, actionKey: PermissionActionKey) {
  return !isPendingResourceMapping(resourceKey, actionKey);
}

function toActionGrants(grants: LegacyGrantItem[]): ActionGrantWithSource[] {
  return grants.flatMap((grant) => {
    const actionKey = roleKeyToActionKey(grant.roleKey);
    if (!actionKey) return [];
    return [{
      subjectId: grant.subjectId,
      resourceKey: grant.resourceKey,
      actionKey,
      resourceId: 0,
      scopeId: grant.scopeId,
      source: grant.source,
    }];
  });
}

function sourceRank(source: PermissionActionSource | null) {
  // Summary color priority: direct(green) > organization(red) > upper/implied(blue) > child/partial(yellow) > empty(gray).
  if (source === "direct") return 0;
  if (source === "position") return 1;
  if (source === "department") return 2;
  if (source === "ancestor") return 3;
  if (source === "implied") return 4;
  if (source === "implicit") return 5;
  if (source === "child") return 6;
  return 9;
}

function pickSummarySource(states: PermissionActionState[]) {
  return [...states].sort((a, b) => sourceRank(a.source) - sourceRank(b.source))[0]?.source ?? null;
}

function grantMatchesSelectedScope(
  grantScopeId: string | null,
  selectedScopeId: string | null | undefined,
  selectedResource: string | null,
) {
  if (selectedScopeId === undefined) return true;
  if (grantScopeId === selectedScopeId) return true;
  return grantScopeId === null && selectedScopeId !== null && canPermissionResourceInheritGlobalScope(selectedResource);
}

function findState(
  grants: ActionGrantWithSource[],
  subjectIds: number[],
  selectedResource: string | null,
  ancestorResourceKeys: string[],
  actionKey: PermissionActionKey,
  source: PermissionActionSource,
  selectedScopeId: string | null | undefined,
): PermissionActionState | null {
  if (!isActionVisibleForResource(selectedResource, actionKey)) return null;
  const subjectIdSet = new Set(subjectIds);
  for (const grant of grants) {
    if (!subjectIdSet.has(grant.subjectId)) continue;
    if (!grantMatchesSelectedScope(grant.scopeId, selectedScopeId, selectedResource)) continue;
    if (grant.resourceKey !== selectedResource && !ancestorResourceKeys.includes(grant.resourceKey)) continue;
    if (!actionImplies(grant.actionKey, actionKey)) continue;
    const fromAncestor = selectedResource ? grant.resourceKey !== selectedResource : false;
    if (fromAncestor && !canPermissionActionInheritFromAncestor(selectedResource, actionKey)) continue;
    return {
      actionKey,
      label: getPermissionActionLabel(actionKey),
      has: true,
      source: fromAncestor ? "ancestor" : grant.source ?? source,
      sourceActionKey: grant.actionKey === actionKey ? null : grant.actionKey,
      sourceResourceKey: grant.resourceKey,
      directGrantable: PERMISSION_ACTION_DEFS[actionKey].directGrantable,
      pendingResourceMapping: isPendingResourceMapping(selectedResource, actionKey),
    };
  }
  return null;
}

function findChildState(
  grants: ActionGrantItem[],
  subjectIds: number[],
  childResourceKeys: string[],
  actionKey: PermissionActionKey,
  selectedScopeId: string | null | undefined,
  selectedResource: string | null,
): PermissionActionState | null {
  const subjectIdSet = new Set(subjectIds);
  const childKeySet = new Set(childResourceKeys);
  const grant = grants.find((item) =>
    subjectIdSet.has(item.subjectId) &&
    grantMatchesSelectedScope(item.scopeId, selectedScopeId, selectedResource) &&
    childKeySet.has(item.resourceKey) &&
    actionImplies(item.actionKey, actionKey)
  );
  if (!grant) return null;
  return {
    actionKey,
    label: getPermissionActionLabel(actionKey),
    has: true,
    source: "child",
    sourceActionKey: grant.actionKey === actionKey ? null : grant.actionKey,
    sourceResourceKey: grant.resourceKey,
    directGrantable: false,
    pendingResourceMapping: false,
  };
}

function emptyState(resourceKey: string | null, actionKey: PermissionActionKey): PermissionActionState {
  const pendingResourceMapping = isPendingResourceMapping(resourceKey, actionKey);
  return {
    actionKey,
    label: getPermissionActionLabel(actionKey),
    has: false,
    source: null,
    sourceActionKey: null,
    sourceResourceKey: null,
    directGrantable: !pendingResourceMapping && PERMISSION_ACTION_DEFS[actionKey].directGrantable,
    pendingResourceMapping,
  };
}

function summarizeTopAction(states: PermissionActionState[], order: PermissionActionKey[]): PermissionSummaryItem | null {
  for (const actionKey of order) {
    const state = states.find((item) => item.actionKey === actionKey && item.has);
    if (state) {
      return { label: PERMISSION_ACTION_DEFS[actionKey].shortLabel, source: state.source, actionKeys: [actionKey] };
    }
  }
  return null;
}

function summarizeActionList(states: PermissionActionState[], actionKeys: PermissionActionKey[]): PermissionSummaryItem | null {
  const matched = actionKeys
    .map((actionKey) => states.find((item) => item.actionKey === actionKey && item.has))
    .filter((state): state is PermissionActionState => Boolean(state));
  if (matched.length === 0) return null;
  return {
    label: matched.map((state) => PERMISSION_ACTION_DEFS[state.actionKey].shortLabel).join(" + "),
    source: pickSummarySource(matched),
    actionKeys: matched.map((state) => state.actionKey),
  };
}

export function buildPermissionRecords(input: BuildPermissionRecordsInput): Record<number, PermissionRecord> {
  const legacyDirect = toActionGrants(input.directGrants);
  const legacyPosition = toActionGrants(input.positionGrants);
  const legacyDepartment = toActionGrants(input.departmentGrants);
  const legacyImplicit = toActionGrants(input.implicitGrants);
  const directGrants = [...legacyDirect, ...input.directActionGrants];
  const positionGrants = [...legacyPosition, ...input.positionActionGrants];
  const departmentGrants = [...legacyDepartment, ...input.departmentActionGrants];
  const childResourceKeys = input.childResourceKeys ?? [];
  const records = new Map<number, PermissionRecord>();

  for (const subject of input.subjects) {
    const subjectId = input.subjectType === "user"
      ? Number(subject.extra?.userId ?? subject.id)
      : subject.id;
    const positionIds = (subject.extra?.positionIds as number[] | undefined) ?? [];
    const departmentIds = (subject.extra?.departmentIds as number[] | undefined) ?? [];
    const states = {} as Record<PermissionActionKey, PermissionActionState>;

    for (const actionKey of Object.keys(PERMISSION_ACTION_DEFS) as PermissionActionKey[]) {
      const state = isActionVisibleForResource(input.selectedResource, actionKey)
        ? findState(directGrants, [subjectId], input.selectedResource, input.ancestorResourceKeys, actionKey, "direct", input.selectedScopeId) ??
          (input.subjectType === "user" ? findState(positionGrants, positionIds, input.selectedResource, input.ancestorResourceKeys, actionKey, "position", input.selectedScopeId) : null) ??
          (input.subjectType === "user" ? findState(departmentGrants, departmentIds, input.selectedResource, input.ancestorResourceKeys, actionKey, "department", input.selectedScopeId) : null) ??
          findState(legacyImplicit, [subject.id], input.selectedResource, input.ancestorResourceKeys, actionKey, "implicit", input.selectedScopeId) ??
          findChildState(directGrants, [subjectId], childResourceKeys, actionKey, input.selectedScopeId, input.selectedResource) ??
          (input.subjectType === "user" ? findChildState(positionGrants, positionIds, childResourceKeys, actionKey, input.selectedScopeId, input.selectedResource) : null) ??
          (input.subjectType === "user" ? findChildState(departmentGrants, departmentIds, childResourceKeys, actionKey, input.selectedScopeId, input.selectedResource) : null) ??
          emptyState(input.selectedResource, actionKey)
        : emptyState(input.selectedResource, actionKey);
      states[actionKey] = state;
    }

    const allStates = Object.values(states);
    const basicSummary = summarizeTopAction(allStates, ["delete", "write", "create", "access"]);
    const workflowSubmit = states.submit.has ? states.submit : null;
    const workflowApprove = states.approve.has ? states.approve : null;
    const workflowStates = [workflowSubmit, workflowApprove].filter((state): state is PermissionActionState => Boolean(state));
    const workflowSummary = workflowStates.length
      ? { label: workflowStates.map((state) => PERMISSION_ACTION_DEFS[state.actionKey].shortLabel).join(" + "), source: pickSummarySource(workflowStates), actionKeys: workflowStates.map((state) => state.actionKey) }
      : null;
    const lifecycleSummary = summarizeActionList(allStates, ["archive", "revise"]);
    const exchangeSummary = summarizeActionList(allStates, ["import", "export"]);
    const adminSummary = states.admin.has ? { label: "管理", source: states.admin.source, actionKeys: ["admin" as const] } : null;
    const riskSummary = states.submit.has && states.approve.has
      ? { label: "submit+approve", source: null, actionKeys: ["submit", "approve"] as PermissionActionKey[] }
      : null;
    const actionTree = PERMISSION_GROUP_DEFS
      .map((group) => ({
        key: group.key,
        label: group.label,
        actions: group.actions
          .map((actionKey) => states[actionKey])
          .filter((state) => !state.pendingResourceMapping),
      }))
      .filter((group) => group.actions.length > 0);

    records.set(subject.id, {
      subjectId: subject.id,
      actionStates: states,
      actionTree,
      basicSummary,
      workflowSummary,
      lifecycleSummary,
      exchangeSummary,
      adminSummary,
      riskSummary,
    });
  }

  return Object.fromEntries(records);
}
