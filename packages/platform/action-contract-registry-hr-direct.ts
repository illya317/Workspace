import {
  defineActionContractMetadataList,
  type ActionContractMetadata,
  type ActionMutationDomainBindingReference,
  type ActionMutationDomainReferenceContract,
} from "./action-contract";
import { registeredActionFacts } from "./action-contract-registry-helpers";

const domain = (validatorKey: string, commitKey: string): ActionMutationDomainBindingReference => ({
  validatorKey,
  commitKey,
});

function write(
  key: string,
  activeEntity: string,
  command: ActionMutationDomainReferenceContract,
  options?: { shape?: "full_record" | "field_patch" | "change_set"; targetIdKey?: string; commitMode?: "activate" | "apply_patch" | "native_transition" },
): ActionContractMetadata {
  return {
    ...registeredActionFacts(key),
    kind: "write",
    payload: {
      cardinality: "single",
      shape: options?.shape ?? "field_patch",
      target: options?.commitMode === "activate" ? "new_record" : "existing_record",
      targetIdKey: options?.targetIdKey,
    },
    persistence: {
      strategy: "active_table_state",
      activeEntity,
      supportedPersistenceModes: ["active"],
      defaultMode: "active",
      commitMode: options?.commitMode ?? "apply_patch",
    },
    domain: command,
  };
}

function lifecycle(
  key: string,
  activeEntity: string,
  command: ActionMutationDomainReferenceContract,
  operation: "archive" | "delete" | "restore",
  options?: { targetIdKey?: string; versionKey?: string; deleteMode?: "soft" | "hard"; referencePolicy?: "none" | "guarded" | "domain" },
): ActionContractMetadata {
  return {
    ...registeredActionFacts(key),
    kind: "lifecycle",
    payload: {
      cardinality: "single",
      shape: "field_patch",
      target: "existing_record",
      targetIdKey: options?.targetIdKey ?? "id",
      versionKey: options?.versionKey,
    },
    lifecycle: {
      operation,
      targetIdKey: options?.targetIdKey ?? "id",
      versionKey: options?.versionKey,
      deleteMode: options?.deleteMode,
      referencePolicy: options?.referencePolicy ?? "domain",
      auditPolicy: "history",
    },
    persistence: {
      strategy: "active_table_state",
      activeEntity,
      supportedPersistenceModes: ["active"],
      defaultMode: "active",
      commitMode: "native_transition",
    },
    domain: command,
  };
}

function governance(
  key: string,
  activeEntity: string,
  command: ActionMutationDomainReferenceContract,
  subject: "organization" | "relationship" | "classification" | "configuration",
  auditPolicy: "history" | "event" | "none" = "history",
  persistenceStrategy: "active_table_state" | "file_state" = "active_table_state",
): ActionContractMetadata {
  return {
    ...registeredActionFacts(key),
    kind: "governance",
    payload: { cardinality: "single", shape: "field_patch", target: "mixed", targetIdKey: "id" },
    governance: { subject, scope: subject === "configuration" ? "resource" : "organization", auditPolicy },
    persistence: {
      strategy: persistenceStrategy,
      activeEntity,
      supportedPersistenceModes: ["active"],
      defaultMode: "active",
      commitMode: "native_transition",
    },
    domain: command,
  };
}

export const HR_DIRECT_ACTION_CONTRACT_METADATA = defineActionContractMetadataList([
  {
    key: "hr.roster.generated.export",
    version: 1,
    kind: "exchange",
    label: "导出花名册生成资料",
    targetKind: "HrRosterGeneratedExport",
    resource: {
      resourceKey: "hr.roster.generated",
      moduleKey: "hr",
      scopeTypes: ["global"],
      directPermissionAction: "export",
    },
    payload: {
      cardinality: "single",
      shape: "full_record",
      target: "mixed",
      notes: "查询参数声明导出版式、筛选、字段选择和合并单元格留白规则；producer 统一归一化字段列表。",
    },
    exchange: {
      direction: "export",
      transport: "file",
      result: "file",
      contentTypes: ["text/csv; charset=utf-8"],
      notes: "响应是带 UTF-8 BOM 的 CSV 文件，不产生业务持久化。",
    },
    domain: {
      validatorKey: "packages/hr/server/route-commands.buildRosterGeneratedCsvCommand",
      executeKey: "packages/hr/server/route-commands.produceRosterGeneratedCsv",
    },
    api: {
      commandRoute: "GET /api/modules/hr/roster/generated/export",
      directRoutes: ["GET /api/modules/hr/roster/generated/export"],
      envelopeVersion: 1,
    },
    workflow: {
      kind: "not_applicable",
      reason: "导出是只读文件生成，不创建审批草稿或正式业务记录。",
    },
    display: {
      titleTemplate: "导出花名册生成资料",
      summaryTemplate: "{variant}",
      hrefPattern: "/hr/roster",
    },
  },
  write("hr.roster.company.create", "Company", domain(
    "packages/hr/server/domain/company-validation.buildCompanyCreateCommand",
    "packages/hr/server/companies.createCompany",
  ), { shape: "full_record", commitMode: "activate" }),
  write("hr.roster.company.update", "Company", {
    bindings: [
      domain("packages/hr/server/domain/company-validation.buildCompanyUpsertCommand", "packages/hr/server/companies.upsertCompany"),
      domain("packages/hr/server/domain/company-validation.buildCompanyFieldUpdateCommand", "packages/hr/server/companies.updateCompanyField"),
    ],
  }),
  lifecycle("hr.roster.company.delete", "Company", domain(
    "packages/hr/server/domain/company-validation.validateCompanyDeleteCommand",
    "packages/hr/server/companies.deleteCompany",
  ), "delete", { versionKey: "expectedVersion", deleteMode: "hard", referencePolicy: "domain" }),
  governance("hr.roster.companyRelation.create", "CompanyRelation", domain(
    "packages/hr/server/domain/company-relation-validation.buildCompanyRelationCreateCommand",
    "packages/hr/server/company-relations.createCompanyRelation",
  ), "relationship"),
  governance("hr.roster.companyRelation.update", "CompanyRelation", domain(
    "packages/hr/server/domain/company-relation-validation.buildCompanyRelationFieldUpdateCommand",
    "packages/hr/server/company-relations.updateCompanyRelationField",
  ), "relationship"),
  governance("hr.roster.companyRelation.delete", "CompanyRelation", domain(
    "packages/hr/server/domain/company-relation-validation.validateCompanyRelationDeleteCommand",
    "packages/hr/server/company-relations.deleteCompanyRelation",
  ), "relationship"),
  lifecycle("hr.roster.department.archive", "Department", domain(
    "packages/hr/server/domain/department-validation.buildDepartmentUpdateCommand",
    "packages/hr/server/departments.updateDepartment",
  ), "archive", { referencePolicy: "domain" }),
  lifecycle("hr.roster.department.delete", "Department", domain(
    "packages/hr/server/domain/department-validation.validateDepartmentDelete",
    "packages/hr/server/departments.deleteDepartment",
  ), "delete", { versionKey: "expectedVersion", deleteMode: "hard", referencePolicy: "domain" }),
  write("hr.roster.edp.create", "EDP", domain(
    "packages/hr/server/domain/edp-validation.buildEdpCreateCommand",
    "packages/hr/server/edps.createEdp",
  ), { shape: "full_record", commitMode: "activate" }),
  write("hr.roster.edp.update", "EDP", domain(
    "packages/hr/server/domain/edp-validation.buildEdpFieldUpdateCommand",
    "packages/hr/server/edps.updateEdpField",
  )),
  lifecycle("hr.roster.edp.delete", "EDP", domain(
    "packages/hr/server/domain/edp-validation.validateEdpDeleteCommand",
    "packages/hr/server/edps.deleteEdp",
  ), "delete", { versionKey: "expectedVersion", deleteMode: "hard", referencePolicy: "none" }),
  write("hr.roster.employee.create", "Employee", domain(
    "packages/hr/server/domain/employee-validation.buildEmployeeCreateCommand",
    "packages/hr/server/employees.createEmployeeWithAccount",
  ), { shape: "full_record", commitMode: "activate" }),
  write("hr.roster.employee.update", "Employee", domain(
    "packages/hr/server/domain/employee-validation.buildEmployeeFieldUpdateCommand",
    "packages/hr/server/employees.updateEmployeeFieldById",
  )),
  lifecycle("hr.roster.employee.delete", "Employee", domain(
    "packages/hr/server/domain/employee-validation.validateEmployeeDeleteCommand",
    "packages/hr/server/employees.deleteEmployee",
  ), "delete", { versionKey: "expectedVersion", deleteMode: "hard", referencePolicy: "domain" }),
  write("hr.roster.employeeContract.create", "Employment.contracts", domain(
    "packages/hr/server/domain/contract-validation.buildContractCreateCommand",
    "packages/hr/server/contracts.createEmployeeContract",
  ), { shape: "full_record", commitMode: "activate" }),
  write("hr.roster.employeeContract.update", "Employment.contracts", domain(
    "packages/hr/server/domain/contract-validation.buildContractFieldUpdateCommand",
    "packages/hr/server/contracts.updateContractField",
  ), { targetIdKey: "contractId" }),
  lifecycle("hr.roster.employeeContract.delete", "Employment.contracts", domain(
    "packages/hr/server/domain/contract-validation.buildContractDeleteCommand",
    "packages/hr/server/contracts.deleteContract",
  ), "delete", { targetIdKey: "contractId", referencePolicy: "none" }),
  write("hr.roster.employeeProfile.contracts.save", "Employment.contracts", domain(
    "packages/hr/server/domain/contract-validation.buildEmployeeProfileContractsCommand",
    "packages/hr/server/employee-contracts.updateEmployeeProfileContracts",
  ), { shape: "change_set", targetIdKey: "employeeId", commitMode: "native_transition" }),
  write("hr.roster.employeeProfile.edps.save", "EDP", domain(
    "packages/hr/server/domain/edp-validation.buildSaveEmployeeEdpsCommand",
    "packages/hr/server/employee-edps.updateEmployeeProfileEdps",
  ), { shape: "change_set", targetIdKey: "employeeId", commitMode: "native_transition" }),
  write("hr.roster.employment.create", "Employment", domain(
    "packages/hr/server/domain/employment-validation.buildEmploymentCreateCommand",
    "packages/hr/server/employments.createEmploymentRecord",
  ), { shape: "full_record", commitMode: "activate" }),
  write("hr.roster.employment.update", "Employment", domain(
    "packages/hr/server/domain/employment-validation.buildEmploymentFieldUpdateCommand",
    "packages/hr/server/employments.updateEmploymentField",
  )),
  lifecycle("hr.roster.position.archive", "Position", domain(
    "packages/hr/server/domain/position-validation.buildPositionUpdateCommand",
    "packages/hr/server/positions.updatePosition",
  ), "archive", { referencePolicy: "domain" }),
  lifecycle("hr.roster.position.delete", "Position", domain(
    "packages/hr/server/domain/position-validation.validatePositionDelete",
    "packages/hr/server/positions.deletePosition",
  ), "delete", { versionKey: "expectedVersion", deleteMode: "hard", referencePolicy: "domain" }),
  governance("hr.roster.positionDescription.save", "PositionDescription", domain(
    "packages/hr/server/domain/position-description-validation.buildPositionDescriptionUpdateCommand",
    "packages/hr/server/position-descriptions.updatePositionDescription",
  ), "configuration"),
  governance("hr.roster.positionReportOverride.save", "PositionReportOverride", domain(
    "packages/hr/server/domain/position-report-override-validation.buildPositionReportOverrideSaveCommand",
    "packages/hr/server/position-report-overrides.savePositionReportOverrides",
  ), "relationship"),
  lifecycle("hr.roster.audit.restore", "HrAuditSnapshot", domain(
    "packages/hr/server/domain/audit-restore-validation.buildHrAuditRestoreCommand",
    "packages/hr/server/route-commands.executeHrAuditRestoreCommand",
  ), "restore", { targetIdKey: "historyId", referencePolicy: "domain" }),
  governance("hr.roster.departmentCode.save", "Department", domain(
    "packages/hr/server/domain/code-governance-validation.buildDepartmentCodeSaveCommand",
    "packages/hr/server/department-codes.upsertDepartmentCode",
  ), "classification"),
  governance("hr.roster.departmentCode.delete", "Department", domain(
    "packages/hr/server/domain/code-governance-validation.buildDepartmentCodeDeleteCommand",
    "packages/hr/server/department-codes.deleteDepartmentCode",
  ), "classification"),
  governance("hr.roster.positionCode.save", "Position", domain(
    "packages/hr/server/domain/code-governance-validation.buildPositionCodeSaveCommand",
    "packages/hr/server/position-codes.upsertPositionCode",
  ), "classification"),
  governance("hr.roster.positionCode.delete", "Position", domain(
    "packages/hr/server/domain/code-governance-validation.buildPositionCodeDeleteCommand",
    "packages/hr/server/position-codes.deletePositionCode",
  ), "classification"),
  governance("hr.roster.positionDescriptionTemplate.save", "PositionDescriptionViewTemplateFile", domain(
    "packages/hr/server/domain/position-description-template-validation.buildPositionDescriptionTemplateSaveCommand",
    "packages/hr/server/position-description-template-store.executePositionDescriptionTemplateSaveCommand",
  ), "configuration", "none", "file_state"),
]);
