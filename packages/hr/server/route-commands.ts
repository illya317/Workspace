import { okCommand } from "@workspace/platform/server/domain-validation";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { getAuditLogDates, getAuditLogEntries } from "@workspace/platform/server/audit-log";
import { authorize, checkHRAccess, isSuperAdmin } from "@workspace/platform/server/auth";
import { normalizeLifecycleScope, searchFkOptions, type FkSearchParams } from "@workspace/platform/server/fk-registry";
import { isHrAuditEntityType } from "./audit-entities";
import { searchHrAutocomplete } from "./autocomplete";
import { createEmployeeWithAccount } from "./employees";
import { searchEmployeesForAccountLink } from "./employees";
import { getEmployeeProfileHistoryByKey } from "./employee-history";
import { getEmployeeProfileByKey } from "./employee-profile";
import { HR_FK_REGISTRY } from "./fk-registry";
import {
  getPositionDescriptionByCode,
  getPositionDescriptionTree,
  listPositionDescriptions,
} from "./position-descriptions";
import {
  ROSTER_FIELDS,
  buildRosterExcel,
  buildRosterRows,
  getRosterFilterOptions,
  getVisibleFields,
  queryRawEmployees,
} from "./roster";
import { renderRosterGeneratedCsv } from "./roster-generated";

export function buildHrRouteCommand<T>(command: T) {
  return okCommand(command);
}

export function replayJsonRequest(request: Request, body: unknown) {
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(body ?? {}),
  });
}

export function idParams(id: number) {
  return Promise.resolve({ id: String(id) });
}

export function buildHrAuditLogCommand<T extends { entityType: string }>(input: T) {
  if (!isHrAuditEntityType(input.entityType)) return { ok: false as const, issue: { message: "无权限", status: 403 } };
  return okCommand(input);
}

export async function executeHrAuditLogCommand(command: {
  entityType: string;
  date?: string;
  dates?: string;
  page: number;
  pageSize: number;
}) {
  if (command.dates === "1") return { dates: await getAuditLogDates(command.entityType) };
  return getAuditLogEntries(command.entityType, command.date, command.page, command.pageSize);
}

export async function executePositionDescriptionQuery(command: {
  code?: string;
  tree?: string;
  search?: string;
}): Promise<unknown> {
  if (command.tree === "1") return getPositionDescriptionTree();
  if (command.code) return getPositionDescriptionByCode(command.code);
  return listPositionDescriptions(command.search || "");
}

export async function executeCreateEmployeeWithAccountCommand(command: { name: string; userId: number }) {
  const result = await createEmployeeWithAccount(command.name, command.userId);
  if (!result.ok) return serviceError(result.error, result.status);
  return serviceOk({ success: true, employee: result.employee, user: result.user });
}

function profileResultResponse<T>(result:
  | { status: "invalid"; data?: undefined }
  | { status: "not_found"; data?: undefined }
  | { status: "ok"; data: T }
) {
  if (result.status === "invalid") return serviceError("员工ID无效", 400);
  if (result.status === "not_found") return serviceError("员工不存在", 404);
  return result.data;
}

export async function executeEmployeeProfileCommand(command: { id: string }) {
  return profileResultResponse(await getEmployeeProfileByKey(command.id));
}

export async function executeEmployeeProfileHistoryCommand(command: { id: string }) {
  return profileResultResponse(await getEmployeeProfileHistoryByKey(command.id));
}

export async function executeEmployeeAccountSearchCommand(command: { q: string }) {
  return { items: await searchEmployeesForAccountLink(command.q) };
}

export async function executeHrReferenceOptionsCommand(command: {
  fkKey: string;
  keyword: string;
  lifecycleScope?: string;
  userId: number;
  params: FkSearchParams;
}) {
  try {
    const definition = HR_FK_REGISTRY.require(command.fkKey);
    if (definition.scope !== "hr") return serviceError("无权限", 403);
    const allowed = await authorize({
      user: command.userId,
      resourceKey: definition.permission.resourceKey,
      action: definition.permission.action,
    });
    if (!allowed) return serviceError("无权限", 403);
    const items = await searchFkOptions(HR_FK_REGISTRY, {
      fkKey: command.fkKey,
      keyword: command.keyword,
      lifecycleScope: command.lifecycleScope ? normalizeLifecycleScope(command.lifecycleScope) : undefined,
      userId: command.userId,
      params: command.params,
    });
    return { items };
  } catch (error) {
    return serviceError(error instanceof Error ? error.message : "候选项查询失败", 400);
  }
}

export async function executeHrAutocompleteCommand(command: {
  fkKey?: string;
  entity: string;
  keyword: string;
  activeOnly: boolean;
  lifecycleScope?: string;
  userId: number;
  params: FkSearchParams;
}) {
  if (command.fkKey) {
    return executeHrReferenceOptionsCommand({
      fkKey: command.fkKey,
      keyword: command.keyword,
      lifecycleScope: command.lifecycleScope,
      userId: command.userId,
      params: command.params,
    });
  }
  if (!(await checkHRAccess(command.userId, "access", "hr.roster"))) return serviceError("无权限", 403);
  const result = await searchHrAutocomplete(command.entity, command.keyword, command.activeOnly);
  if (result.status === "unsupported") return serviceError("不支持的实体类型", 400);
  return { items: result.items };
}

export async function executeRosterCommand(command: {
  raw: boolean;
  dept: string;
  keyword: string;
  exportExcel: boolean;
  userId: number;
}) {
  const isAdmin = await isSuperAdmin(command.userId);
  if (command.raw) {
    const employees = await queryRawEmployees(command.keyword);
    return { employees };
  }

  const rows = await buildRosterRows(command.dept, command.keyword);
  const visibleFields = await getVisibleFields(command.userId, isAdmin);
  if (command.exportExcel) {
    const body = buildRosterExcel(rows, visibleFields) as unknown as BodyInit;
    return new Response(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="roster_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  }

  const { allCompanies, allDepts } = await getRosterFilterOptions();
  return { employees: rows, fields: ROSTER_FIELDS, visibleFields, allCompanies, allDepts };
}

export async function executeRosterGeneratedCsvCommand(command: Parameters<typeof renderRosterGeneratedCsv>[0]) {
  const csv = await renderRosterGeneratedCsv(command);
  const filename = command.variant === "management" ? "hr-roster-management.csv" : "hr-roster-due-diligence.csv";
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function buildRosterGeneratedCsvCommand(input: Omit<Parameters<typeof renderRosterGeneratedCsv>[0], "fields"> & {
  fields: string;
}) {
  return okCommand({
    ...input,
    fields: input.fields ? input.fields.split(",").map((field) => field.trim()).filter(Boolean) : undefined,
  });
}
