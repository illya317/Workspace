import "server-only";

import { listCompanyDirectory } from "@workspace/platform/server/company-directory";
import { getAuditLogEntries, type AuditLogEntry } from "@workspace/platform/server/audit-log";
import { flattenWorkspaceAnalysisNestedValue } from "@workspace/platform/server/workspace-analysis-nested-values";
import { runRegisteredWorkspaceAnalysisSource } from "@workspace/platform/server/workspace-analysis-source-executor";
import {
  WorkspaceAnalysisRuntimeError,
  type WorkspaceAnalysisSourceLoadRequest,
} from "@workspace/platform/server/workspace-analysis-runtime";

import { getContracts } from "./contracts";
import { listDepartments } from "./departments";
import { listEdps } from "./edps";
import { listEmployees } from "./employees";
import { listCurrentDepartmentEmployments, listEmployments } from "./employments";
import { getPositionList } from "./positions";
import { listPositionReportOverrides } from "./position-report-overrides";
import { isHrAuditEntityType } from "./audit-entities";
import {
  buildHrWorkspaceAnalysisSourceCatalog,
  canDiscoverHrWorkspaceAnalysisSource,
} from "./workspace-analysis-source-access";
import {
  isHrPerformanceWorkspaceAnalysisSourceKey,
  loadHrPerformanceWorkspaceAnalysisRows,
} from "./workspace-analysis-performance-executor";

export function loadHrWorkspaceAnalysisSource(request: WorkspaceAnalysisSourceLoadRequest) {
  const catalog = buildHrWorkspaceAnalysisSourceCatalog();
  let performanceRows: Promise<readonly unknown[]> | undefined;
  return runRegisteredWorkspaceAnalysisSource({
    ownerUnitId: "hr",
    sourceCatalog: catalog,
    request,
    canExecute: canDiscoverHrWorkspaceAnalysisSource,
    loadPage: async (input) => {
      if (input.signal.aborted) throw cancelled(request.sourceKey);
      if (isHrPerformanceWorkspaceAnalysisSourceKey(input.registration.definition.sourceKey)) {
        performanceRows ??= loadHrPerformanceWorkspaceAnalysisRows({
          sourceKey: input.registration.definition.sourceKey,
          requesterId: input.requesterId,
          targetType: input.targetType,
          targetId: input.targetId,
          parameters: input.parameters,
        });
        const rows = await performanceRows;
        if (input.signal.aborted) throw cancelled(request.sourceKey);
        return paginate(rows, input.page, input.pageSize);
      }
      const page = await loadHrSourcePage(input);
      if (input.signal.aborted) throw cancelled(request.sourceKey);
      return page;
    },
  });
}

async function loadHrSourcePage(input: {
  readonly registration: { readonly definition: { readonly sourceKey: string } };
  readonly targetType: WorkspaceAnalysisSourceLoadRequest["targetType"];
  readonly targetId: number;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly page: number;
  readonly pageSize: number;
}) {
  const sourceKey = input.registration.definition.sourceKey;
  if (sourceKey === "hr.employees") {
    const result = await listEmployees({
      keyword: "",
      isActive: booleanParameter(input.parameters.isActive),
      company: "",
      department: "",
      position: "",
      personnelType: textParameter(input.parameters.personnelType),
      page: input.page,
      pageSize: input.pageSize,
    });
    return { rows: result.employees, totalRows: result.total };
  }
  if (sourceKey === "hr.employments") {
    const query = {
      keyword: "",
      isActive: booleanParameter(input.parameters.isActive),
      company: textParameter(input.parameters.company),
      department: "",
      position: "",
      personnelType: textParameter(input.parameters.personnelType),
      page: input.page,
      pageSize: input.pageSize,
    };
    const result = input.targetType === "department"
      ? await listCurrentDepartmentEmployments({ ...query, departmentId: input.targetId })
      : await listEmployments(query);
    return { rows: result.items, totalRows: result.total };
  }
  if (sourceKey === "hr.edps") {
    const result = await listEdps({
      keyword: "",
      isActive: booleanParameter(input.parameters.isActive),
      company: "",
      department: "",
      position: "",
      page: input.page,
      pageSize: input.pageSize,
    });
    return { rows: result.positions, totalRows: result.total };
  }
  if (sourceKey === "hr.contracts") {
    const result = await getContracts({
      company: "",
      department: "",
      isActive: booleanParameter(input.parameters.isActive),
      keyword: "",
      position: "",
      page: input.page,
      pageSize: input.pageSize,
    });
    return { rows: result.contracts, totalRows: result.total };
  }
  if (sourceKey === "hr.departments") {
    const result = await listDepartments({
      keyword: "",
      page: input.page,
      pageSize: input.pageSize,
      archived: input.parameters.archived === true,
      summary: true,
    });
    return { rows: result.departments, totalRows: result.total };
  }
  if (sourceKey === "hr.department-descriptions") {
    const result = await listDepartments({
      keyword: "",
      page: 1,
      pageSize: 5_000,
      archived: input.parameters.archived === true,
      summary: false,
    });
    return paginate(
      result.departments.flatMap((department) => department.descriptions.flatMap((description) => (
        flattenWorkspaceAnalysisNestedValue(description.details).map((value) => ({
          rowKey: `${department.id}:${description.id}:${value.path}`,
          parentId: department.id,
          parentCode: department.code,
          parentName: department.name,
          descriptionId: description.id,
          sourceFile: description.sourceFile,
          codeRaw: description.codeRaw,
          ...value,
        }))
      ))),
      input.page,
      input.pageSize,
    );
  }
  if (sourceKey === "hr.department-managers") {
    const result = await listDepartments({
      keyword: "",
      page: 1,
      pageSize: 5_000,
      archived: input.parameters.archived === true,
      summary: true,
    });
    return paginate(
      result.departments.flatMap((department) => {
        const rowCount = Math.max(department.managerEmployeeIds.length, department.managerEmployeeNames.length);
        return Array.from({ length: rowCount }, (_, ordinal) => ({
          rowKey: `${department.id}:${ordinal}`,
          departmentId: department.id,
          departmentCode: department.code,
          departmentName: department.name,
          employeeId: department.managerEmployeeIds[ordinal] ?? null,
          employeeName: department.managerEmployeeNames[ordinal] ?? null,
          ordinal,
        }));
      }),
      input.page,
      input.pageSize,
    );
  }
  if (sourceKey === "hr.positions") {
    const result = await getPositionList(
      "",
      input.page,
      input.pageSize,
      input.parameters.archived === true,
      true,
    );
    return { rows: result.positions, totalRows: result.total };
  }
  if (sourceKey === "hr.position-descriptions") {
    const result = await getPositionList(
      "",
      1,
      5_000,
      input.parameters.archived === true,
      false,
    );
    return paginate(
      result.positions.flatMap((position) => (
        flattenWorkspaceAnalysisNestedValue(position.positionDescriptionDetails).map((value) => ({
          rowKey: `${position.id}:${position.positionDescriptionId ?? "none"}:${value.path}`,
          parentId: position.id,
          parentCode: position.code,
          parentName: position.name,
          descriptionId: position.positionDescriptionId,
          sourceFile: position.sourceFile,
          codeRaw: position.codeRaw,
          ...value,
        }))
      )),
      input.page,
      input.pageSize,
    );
  }
  if (sourceKey === "hr.companies") {
    const result = await listCompanyDirectory({
      keyword: "",
      activeOnly: input.parameters.activeOnly === true,
      page: input.page,
      pageSize: input.pageSize,
    });
    return { rows: result.companies, totalRows: result.total };
  }
  if (sourceKey === "hr.audit-entries") {
    const entityType = auditEntityType(input.parameters.entityType, sourceKey);
    const result = await getAuditLogEntries(
      entityType,
      optionalTextParameter(input.parameters.date),
      input.page,
      input.pageSize,
    );
    return { rows: result.entries, totalRows: result.total };
  }
  if (sourceKey === "hr.audit-changes") {
    const entityType = auditEntityType(input.parameters.entityType, sourceKey);
    const entries = await loadAllAuditEntries(entityType, optionalTextParameter(input.parameters.date), sourceKey);
    return paginate(entries.flatMap((entry) => entry.changes.map((change, changeOrdinal) => ({
      rowKey: `${entry.id}:${changeOrdinal}`,
      auditEntryId: entry.id,
      entityId: entry.entityId,
      entityName: entry.entityName,
      version: entry.version,
      editorName: entry.editorName,
      createdAt: entry.createdAt,
      changeOrdinal,
      field: change.field,
      label: change.label ?? null,
      from: change.from ?? null,
      to: change.to,
    }))), input.page, input.pageSize);
  }
  if (sourceKey === "hr.position-report-overrides") {
    const positionId = integerParameter(input.parameters.positionId);
    if (!positionId) throw invalidParameter(sourceKey, "来源岗位 ID 无效");
    const result = await listPositionReportOverrides(positionId);
    if (!("overrides" in result) || !Array.isArray(result.overrides)) {
      throw new WorkspaceAnalysisRuntimeError("source_unavailable", "岗位特殊汇报规则暂不可用", sourceKey);
    }
    return paginate(result.overrides, input.page, input.pageSize);
  }
  throw new WorkspaceAnalysisRuntimeError("source_unavailable", "HR 经营分析数据源暂不可用", sourceKey);
}

async function loadAllAuditEntries(entityType: string, date: string | undefined, sourceKey: string) {
  const entries: AuditLogEntry[] = [];
  let total = 0;
  for (let page = 1; page <= 20; page += 1) {
    const result = await getAuditLogEntries(entityType, date, page, 200);
    total = result.total;
    if (total > 4_000) {
      throw new WorkspaceAnalysisRuntimeError("source_limit_exceeded", "HR 审计记录超过登记上限", sourceKey);
    }
    entries.push(...result.entries);
    if (entries.length >= total) return entries;
  }
  throw new WorkspaceAnalysisRuntimeError("source_limit_exceeded", "HR 审计记录超过登记分页上限", sourceKey);
}

function paginate(rows: readonly unknown[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), totalRows: rows.length };
}

function textParameter(value: string | number | boolean | undefined) {
  return typeof value === "string" ? value : "";
}

function optionalTextParameter(value: string | number | boolean | undefined) {
  return typeof value === "string" && value ? value : undefined;
}

function integerParameter(value: string | number | boolean | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function auditEntityType(value: string | number | boolean | undefined, sourceKey: string) {
  if (typeof value !== "string" || !isHrAuditEntityType(value)) {
    throw invalidParameter(sourceKey, "HR 审计实体类型无效");
  }
  return value;
}

function invalidParameter(sourceKey: string, message: string) {
  return new WorkspaceAnalysisRuntimeError("source_response_invalid", message, sourceKey);
}

function booleanParameter(value: string | number | boolean | undefined) {
  return typeof value === "boolean" ? String(value) : null;
}

function cancelled(sourceKey: string) {
  return new WorkspaceAnalysisRuntimeError("cancelled", "经营分析运行已取消", sourceKey);
}
