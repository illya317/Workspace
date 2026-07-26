import "server-only";

import { actionImplies, type PermissionActionKey } from "@workspace/platform/permission-actions";
import {
  getNaturalSpaceActionProfileActionKeys,
  type NaturalSpaceActionProfile,
} from "@workspace/platform/permission-natural-space-actions";
import { getSpaceChildResourceKeyForTargetType } from "@workspace/platform/permission-resource-policy";
import { isRootAdminUser } from "../auth/root";
import {
  businessSpaceScopeId,
  canManageScopedPermissionGrant,
  getCompanyNaturalSpaceActionProfile,
  getDepartmentNaturalSpaceActionProfile,
  getOperatingCommitteeNaturalSpaceActionProfile,
} from "../business-space-permissions";
import { currentEmploymentDateWhere, currentOpenEndedDateWhere } from "../relation-registry";
import { prisma } from "../prisma";
import { evaluatePermissionAction } from "../rbac/action-grants";
import type {
  DocsEditorSpaceRow,
} from "./db";
import type {
  DocsEditorSpaceActionPermissions,
  DocsEditorSpaceKind,
} from "./types";
import { hrPositionDescriptionDepartment } from "./official-templates";
import { getTenantProfile } from "../tenant-config";

export type DepartmentContext = {
  id: number;
  name: string;
  code: string;
  managerPositionId: number | null;
  isArchived: boolean;
};

export type CompanyContext = {
  id: number;
  name: string;
};

export type DocsEditorSpaceTargetType = DocsEditorSpaceKind;

export async function hasDocsEditorAdmin(userId: number) {
  return isRootAdminUser(userId);
}

export function docsEditorScopeId(space: { targetType: string; targetId: number }) {
  return businessSpaceScopeId(normalizeDocsEditorTargetType(space.targetType), space.targetId);
}

async function hasDocsEditorScopedAction(
  userId: number,
  space: { targetType: string; targetId: number },
  actionKey: PermissionActionKey,
) {
  const resourceKey = getDocsEditorPermissionResourceKey(space.targetType);
  return evaluatePermissionAction(userId, resourceKey, actionKey, {
    scopeId: docsEditorScopeId(space),
    projection: resourceKey === "docs.editor" ? "default" : "space",
  });
}

async function canManageDocsEditorSpacePermissions(
  userId: number,
  space: { targetType: string; targetId: number },
) {
  return canManageScopedPermissionGrant(
    userId,
    getDocsEditorPermissionResourceKey(space.targetType),
    docsEditorScopeId(space),
  );
}

export function getDocsEditorPermissionResourceKey(targetType: string) {
  return getSpaceChildResourceKeyForTargetType(normalizeDocsEditorTargetType(targetType), "templates") ?? "docs.editor";
}

export async function getDocsEditorScopedActionPermissions(
  userId: number,
  space: { targetType: string; targetId: number },
): Promise<DocsEditorSpaceActionPermissions> {
  const resourceKey = getDocsEditorPermissionResourceKey(space.targetType);
  const [profile, canRead, canCreate, canUpdate, canDelete, canArchive, canSubmit, canApprove, canExport, canManagePermissions] = await Promise.all([
    naturalDocsEditorSpaceActionProfile(userId, normalizeDocsEditorTargetType(space.targetType), space.targetId),
    hasDocsEditorScopedAction(userId, space, "read"),
    hasDocsEditorScopedAction(userId, space, "create"),
    hasDocsEditorScopedAction(userId, space, "update"),
    hasDocsEditorScopedAction(userId, space, "delete"),
    hasDocsEditorScopedAction(userId, space, "archive"),
    hasDocsEditorScopedAction(userId, space, "submit"),
    hasDocsEditorScopedAction(userId, space, "approve"),
    hasDocsEditorScopedAction(userId, space, "export"),
    canManageDocsEditorSpacePermissions(userId, space),
  ]);
  const natural = profile
    ? docsEditorActionPermissionsFromKeys(resourceKey, getNaturalSpaceActionProfileActionKeys(resourceKey, profile))
    : emptyDocsEditorActions();
  return {
    canRead: natural.canRead || canRead || canCreate || canUpdate || canDelete || canArchive || canSubmit || canApprove || canExport,
    canCreate: natural.canCreate || canCreate,
    canUpdate: natural.canUpdate || canUpdate,
    canDelete: natural.canDelete || canDelete,
    canArchive: natural.canArchive || canArchive,
    canSubmit: natural.canSubmit || canSubmit,
    canApprove: natural.canApprove || canApprove,
    canPublish: natural.canPublish || natural.canApprove || canApprove,
    canExport: natural.canExport || canExport,
    canManagePermissions,
  };
}

function emptyDocsEditorActions(): DocsEditorSpaceActionPermissions {
  return {
    canRead: false,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canArchive: false,
    canSubmit: false,
    canApprove: false,
    canPublish: false,
    canExport: false,
    canManagePermissions: false,
  };
}

function docsEditorActionPermissionsFromKeys(
  resourceKey: string,
  actionKeys: PermissionActionKey[],
): DocsEditorSpaceActionPermissions {
  void resourceKey;
  const grants = new Set(actionKeys);
  const allows = (actionKey: PermissionActionKey) =>
    actionKeys.some((grantedActionKey) => actionImplies(grantedActionKey, actionKey));
  return {
    ...emptyDocsEditorActions(),
    canRead: allows("read"),
    canCreate: grants.has("create"),
    canUpdate: grants.has("update"),
    canDelete: grants.has("delete"),
    canArchive: grants.has("archive"),
    canSubmit: grants.has("submit"),
    canApprove: grants.has("approve") || grants.has("reject"),
    canPublish: grants.has("approve"),
    canExport: grants.has("export") || allows("read"),
  };
}

export async function docsEditorActionPermissionsForSpace(
  userId: number,
  space: DocsEditorSpaceRow,
): Promise<DocsEditorSpaceActionPermissions> {
  return getDocsEditorScopedActionPermissions(userId, space);
}

export async function canCreateDocsEditorTemplateAction(
  userId: number,
  space: DocsEditorSpaceRow,
) {
  return (await getDocsEditorScopedActionPermissions(userId, space)).canCreate;
}

export async function canUpdateDocsEditorTemplateAction(
  userId: number,
  space: DocsEditorSpaceRow,
) {
  return (await getDocsEditorScopedActionPermissions(userId, space)).canUpdate;
}

export async function canDeleteDocsEditorTemplateAction(
  userId: number,
  space: DocsEditorSpaceRow,
) {
  return (await getDocsEditorScopedActionPermissions(userId, space)).canDelete;
}

export async function canArchiveDocsEditorTemplateAction(
  userId: number,
  space: DocsEditorSpaceRow,
) {
  return (await getDocsEditorScopedActionPermissions(userId, space)).canArchive;
}

export async function canPublishDocsEditorTemplateAction(
  userId: number,
  space: DocsEditorSpaceRow,
) {
  return (await getDocsEditorScopedActionPermissions(userId, space)).canPublish;
}

export async function canSubmitDocsEditorTemplateAction(
  userId: number,
  space: DocsEditorSpaceRow,
) {
  return (await getDocsEditorScopedActionPermissions(userId, space)).canSubmit;
}

export async function canApproveDocsEditorTemplateAction(
  userId: number,
  space: DocsEditorSpaceRow,
) {
  return (await getDocsEditorScopedActionPermissions(userId, space)).canApprove;
}

export async function getUserDepartmentContexts(userId: number): Promise<DepartmentContext[]> {
  const [memberRows, managedRows] = await Promise.all([
    prisma.employee.findMany({
      where: {
        userId,
        employments: { some: currentEmploymentDateWhere() },
        positions: { some: currentOpenEndedDateWhere({ departmentId: { not: null }, department: { isArchived: false, hierarchyKind: "M" } }) },
      },
      select: {
        positions: {
          where: currentOpenEndedDateWhere({ departmentId: { not: null }, department: { isArchived: false, hierarchyKind: "M" } }),
          select: {
            department: {
              select: {
                id: true,
                name: true,
                code: true,
                managerPositionId: true,
                isArchived: true,
              },
            },
          },
        },
      },
    }),
    prisma.department.findMany({
      where: {
        isArchived: false,
        hierarchyKind: "M",
        managerPosition: {
          edps: {
            some: currentOpenEndedDateWhere({
              employee: {
                userId,
                employments: { some: currentEmploymentDateWhere() },
              },
            }),
          },
        },
      },
      select: {
        id: true,
        name: true,
        code: true,
        managerPositionId: true,
        isArchived: true,
      },
    }),
  ]);
  const byId = new Map<number, DepartmentContext>();
  for (const row of memberRows) {
    for (const position of row.positions) {
      if (position.department) byId.set(position.department.id, position.department);
    }
  }
  for (const department of managedRows) {
    byId.set(department.id, department);
  }
  return Array.from(byId.values());
}

export async function getAllDepartmentContexts(): Promise<DepartmentContext[]> {
  return prisma.department.findMany({
    where: { hierarchyKind: "M" },
    select: {
      id: true,
      name: true,
      code: true,
      managerPositionId: true,
      isArchived: true,
    },
    orderBy: [{ isArchived: "asc" }, { code: "asc" }, { id: "asc" }],
  });
}

export async function getDepartmentContext(departmentId: number): Promise<DepartmentContext | null> {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, hierarchyKind: "M" },
    select: { id: true, name: true, code: true, managerPositionId: true, isArchived: true },
  });
  return department;
}

export async function getQcDepartmentContext(): Promise<DepartmentContext | null> {
  const qcDepartment = getTenantProfile().docs.qcDepartment;
  const byCode = await prisma.department.findFirst({
    where: { code: qcDepartment.code, isArchived: false },
    select: { id: true, name: true, code: true, managerPositionId: true, isArchived: true },
  });
  if (byCode) return byCode;
  return prisma.department.findFirst({
    where: { name: qcDepartment.name, isArchived: false },
    select: { id: true, name: true, code: true, managerPositionId: true, isArchived: true },
  });
}

export async function getHrDepartmentContext(): Promise<DepartmentContext | null> {
  const department = hrPositionDescriptionDepartment();
  const byCode = await prisma.department.findFirst({
    where: { code: department.code, isArchived: false },
    select: { id: true, name: true, code: true, managerPositionId: true, isArchived: true },
  });
  if (byCode) return byCode;
  return prisma.department.findFirst({
    where: { name: department.name, isArchived: false },
    select: { id: true, name: true, code: true, managerPositionId: true, isArchived: true },
  });
}

export async function getGroupCompanyContext(): Promise<CompanyContext | null> {
  const company = await prisma.company.findFirst({
    where: {
      isActive: true,
      issuedOwnerships: { none: {} },
      party: { ownedInterests: { some: {} } },
    },
    select: { id: true, party: { select: { name: true } } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return company ? { id: company.id, name: company.party.name } : null;
}

export async function resolveSpaceAccess(
  userId: number,
  space: DocsEditorSpaceRow,
): Promise<boolean> {
  return hasAnyDocsEditorSpaceAction(await getDocsEditorScopedActionPermissions(userId, space));
}

export async function resolveTemplateAccess(input: {
  userId: number;
  template: unknown;
  space: DocsEditorSpaceRow | null;
}): Promise<boolean> {
  void input.template;
  if (!input.space) return false;
  return resolveSpaceAccess(input.userId, input.space);
}

export async function canPublishOfficialQcTemplate(userId: number) {
  return hasDocsEditorAdmin(userId);
}

export function normalizeDocsEditorTargetType(value: string): DocsEditorSpaceTargetType {
  if (value === "company" || value === "committee" || value === "department" || value === "personal") return value;
  return "department";
}

async function naturalDocsEditorSpaceActionProfile(
  userId: number,
  targetType: DocsEditorSpaceTargetType,
  targetId: number,
): Promise<NaturalSpaceActionProfile | null> {
  if (targetType === "personal") return targetId === userId ? "allBusiness" : null;
  if (await hasDocsEditorAdmin(userId)) return "allBusiness";

  if (targetType === "department") {
    return getDepartmentNaturalSpaceActionProfile(userId, targetId);
  }

  if (targetType === "company") return getCompanyNaturalSpaceActionProfile(userId);
  if (targetType === "committee") return getOperatingCommitteeNaturalSpaceActionProfile(userId);

  return null;
}

function hasAnyDocsEditorSpaceAction(actions: DocsEditorSpaceActionPermissions) {
  return actions.canRead
    || actions.canCreate
    || actions.canUpdate
    || actions.canDelete
    || actions.canArchive
    || actions.canSubmit
    || actions.canApprove
    || actions.canPublish
    || actions.canExport
    || actions.canManagePermissions;
}
