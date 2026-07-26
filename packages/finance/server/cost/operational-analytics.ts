import { getSpaceChildResourceKeyForTargetType } from "@workspace/platform/permission-resource-policy";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import {
  businessSpaceScopeId,
  canManageScopedPermissionGrant,
  getNaturalSpaceActionProfile,
  isDepartmentResponsiblePositionUser,
} from "@workspace/platform/server/business-space-permissions";
import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import { prisma } from "@workspace/platform/server/prisma";
import { currentEmploymentDateWhere } from "@workspace/platform/server/relation-registry";
import type { CostQueryParams, ShipmentQueryParams } from "./common";
import { getShipmentAnalytics } from "./shipment-analytics";
import { resolveShipmentDepartmentScope } from "./shipment-department-scope";
import { listShipments } from "./shipments";

export const OPERATIONAL_ANALYTICS_RESOURCE_KEY = "finance.operationalAnalytics";

export type OperationalAnalyticsScopeType = "personal" | "department" | "project";

type OperationalAnalyticsScope = {
  scopeType: OperationalAnalyticsScopeType;
  scopeId: number;
};

type OperationalAnalyticsShipmentCommand = OperationalAnalyticsScope & ShipmentQueryParams & {
  viaPersonalApiKey?: boolean;
};

type OperationalAnalyticsShipmentAnalyticsCommand = OperationalAnalyticsShipmentCommand & {
  grain?: "day" | "month" | "quarter" | "year";
  groupBy?: "customer" | "salesperson" | "product" | "productSpec";
  comparison?: "none" | "previousYear";
};

export function operationalAnalyticsScopeId(scopeType: OperationalAnalyticsScopeType, scopeId: number) {
  return businessSpaceScopeId(scopeType, scopeId);
}

export function operationalAnalyticsPermissionResourceKey(scopeType: OperationalAnalyticsScopeType) {
  if (scopeType === "personal") return OPERATIONAL_ANALYTICS_RESOURCE_KEY;
  return getSpaceChildResourceKeyForTargetType(scopeType, "analytics") ?? OPERATIONAL_ANALYTICS_RESOURCE_KEY;
}

export async function canReadOperationalAnalytics(
  userId: number,
  scopeType: OperationalAnalyticsScopeType,
  scopeId: number,
) {
  if (!Number.isInteger(scopeId) || scopeId <= 0) return false;
  if (scopeType === "personal") return userId === scopeId;

  const resourceKey = operationalAnalyticsPermissionResourceKey(scopeType);
  const scope = operationalAnalyticsScopeId(scopeType, scopeId);
  const [granted, naturalProfile] = await Promise.all([
    evaluatePermissionAction(userId, resourceKey, "read", { scopeId: scope, projection: "space" }),
    getNaturalSpaceActionProfile(userId, scopeType, scopeId),
  ]);
  return granted || naturalProfile !== null;
}

export async function canUseOperationalAnalyticsApi(
  userId: number,
  scopeType: OperationalAnalyticsScopeType,
  scopeId: number,
) {
  if (!await canReadOperationalAnalytics(userId, scopeType, scopeId)) return false;
  const resourceKey = operationalAnalyticsPermissionResourceKey(scopeType);
  if (scopeType === "personal") {
    return evaluatePermissionAction(userId, resourceKey, "apiUse");
  }
  return evaluatePermissionAction(userId, resourceKey, "apiUse", {
    scopeId: operationalAnalyticsScopeId(scopeType, scopeId),
    projection: "space",
  });
}

export async function canConfigureOperationalAnalytics(
  userId: number,
  scopeType: OperationalAnalyticsScopeType,
  scopeId: number,
) {
  if (!await canReadOperationalAnalytics(userId, scopeType, scopeId)) return false;
  if (scopeType === "personal") return userId === scopeId;
  if (scopeType === "department" && await isDepartmentResponsiblePositionUser(userId, scopeId)) return true;
  return evaluatePermissionAction(
    userId,
    operationalAnalyticsPermissionResourceKey(scopeType),
    "configure",
    { scopeId: operationalAnalyticsScopeId(scopeType, scopeId), projection: "space" },
  );
}

export async function canManageOperationalAnalyticsPermissionResource(
  userId: number,
  scopeType: OperationalAnalyticsScopeType,
  scopeId: number,
  resourceKey: string,
) {
  if (scopeType === "personal") return false;
  if (scopeType === "department" && await isDepartmentResponsiblePositionUser(userId, scopeId)) return true;
  return canManageScopedPermissionGrant(userId, resourceKey, operationalAnalyticsScopeId(scopeType, scopeId));
}

export async function executeOperationalAnalyticsShipmentList(
  userId: number,
  command: OperationalAnalyticsShipmentCommand,
) {
  const scoped = await resolveOperationalAnalyticsShipmentScope(userId, command);
  if (!scoped.ok) return scoped;
  return serviceOk({ success: true, ...await listShipments(scoped.data) });
}

export async function executeOperationalAnalyticsShipmentAnalytics(
  userId: number,
  command: OperationalAnalyticsShipmentAnalyticsCommand,
) {
  const scoped = await resolveOperationalAnalyticsShipmentScope(userId, command);
  if (!scoped.ok) return scoped;
  return serviceOk({ success: true, data: await getShipmentAnalytics(scoped.data) });
}

async function resolveOperationalAnalyticsShipmentScope<T extends OperationalAnalyticsScope & CostQueryParams & { viaPersonalApiKey?: boolean }>(
  userId: number,
  command: T,
) {
  const { scopeType, scopeId, departmentId: _ignoredDepartmentId, viaPersonalApiKey, ...params } = command;
  if (!await canReadOperationalAnalytics(userId, scopeType, scopeId)) {
    return serviceError("无权限查看该空间的经营分析", 403);
  }
  if (viaPersonalApiKey && !await canUseOperationalAnalyticsApi(userId, scopeType, scopeId)) {
    return serviceError("当前 API 凭证没有该空间的经营分析 API 使用权限", 403);
  }
  if (scopeType === "project") {
    return serviceError("该项目尚未建立经营数据归集关系", 409);
  }
  if (scopeType === "personal") {
    return serviceOk({ ...params, employeeIds: await personalEmployeeIds(scopeId) });
  }
  return serviceOk(await resolveShipmentDepartmentScope({ ...params, departmentId: scopeId }));
}

async function personalEmployeeIds(userId: number) {
  const employees = await prisma.employee.findMany({
    where: { userId, employments: { some: currentEmploymentDateWhere() } },
    select: { id: true },
  });
  return employees.map((employee) => employee.id);
}
