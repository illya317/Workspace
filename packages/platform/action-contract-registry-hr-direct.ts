import {
  defineActionContractMetadataList,
  type ActionContractMetadata,
  type ActionMutationDomainBindingReference,
  type ActionMutationDomainReferenceContract,
} from "./action-contract";
import { registeredActionFacts, registeredImport } from "./action-contract-registry-helpers";

const domain = (validatorKey: string, commitKey: string): ActionMutationDomainBindingReference => ({
  validatorKey,
  commitKey,
});

function write(
  key: string,
  activeEntity: string,
  command: ActionMutationDomainReferenceContract,
  options?: { shape?: "full_record" | "field_patch" | "change_set"; targetIdKey?: string; versionKey?: string; commitMode?: "activate" | "apply_patch" | "native_transition" },
): ActionContractMetadata {
  return {
    ...registeredActionFacts(key),
    kind: "write",
    payload: {
      cardinality: "single",
      shape: options?.shape ?? "field_patch",
      target: options?.commitMode === "activate" ? "new_record" : "existing_record",
      targetIdKey: options?.targetIdKey,
      versionKey: options?.versionKey,
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
  operation: "archive" | "delete" | "restore" | "custom",
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
  lifecycle("hr.roster.department.archive", "Department", domain(
    "packages/hr/server/domain/department-validation.buildDepartmentUpdateCommand",
    "packages/hr/server/departments.updateDepartment",
  ), "archive", { referencePolicy: "domain" }),
  lifecycle("hr.roster.department.delete", "Department", domain(
    "packages/hr/server/domain/department-validation.validateDepartmentDelete",
    "packages/hr/server/departments.deleteDepartment",
  ), "delete", { versionKey: "expectedVersion", deleteMode: "hard", referencePolicy: "domain" }),
  write("hr.roster.employee.create", "Employee", domain(
    "packages/hr/server/domain/employee-validation.buildEmployeeCreateCommand",
    "packages/hr/server/employees.createEmployeeWithAccount",
  ), { shape: "full_record", commitMode: "activate" }),
  write("hr.roster.employee.update", "Employee", domain(
    "packages/hr/server/domain/employee-validation.buildEmployeePageDraftCommand",
    "packages/hr/server/employees.updateEmployeePageDraft",
  ), { shape: "change_set", commitMode: "native_transition" }),
  lifecycle("hr.roster.employmentAgreement.command", "EmploymentAgreement", domain(
    "packages/hr/server/domain/employment-agreement-validation.buildEmploymentAgreementCommand",
    "packages/hr/server/employment-agreements.executeEmploymentAgreementCommand",
  ), "custom", { targetIdKey: "employeeId", versionKey: "expectedVersion", referencePolicy: "domain" }),
  lifecycle("hr.roster.socialInsurance.command", "EmployeeSocialInsurancePeriod", domain(
    "packages/hr/server/domain/employee-social-insurance-validation.buildEmployeeSocialInsuranceCommand",
    "packages/hr/server/employee-social-insurance.executeEmployeeSocialInsuranceCommand",
  ), "custom", { targetIdKey: "employeeId", versionKey: "expectedVersion", referencePolicy: "domain" }),
  registeredImport({
    key: "hr.roster.employmentAgreementAttachment.upload",
    activeEntity: "EmploymentAgreementAttachment",
    transport: "file",
    result: "records",
    domain: domain(
      "packages/hr/server/domain/employment-agreement-attachment-validation.buildEmploymentAgreementAttachmentUploadCommand",
      "packages/hr/server/employment-agreement-attachments.executeUploadEmploymentAgreementAttachment",
    ),
  }),
  lifecycle("hr.roster.employmentAgreementAttachment.remove", "EmploymentAgreementAttachment", domain(
    "packages/hr/server/domain/employment-agreement-attachment-validation.buildEmploymentAgreementAttachmentRemoveCommand",
    "packages/hr/server/employment-agreement-attachments.executeRemoveEmploymentAgreementAttachment",
  ), "custom", { targetIdKey: "attachmentUid", deleteMode: "soft", referencePolicy: "domain" }),
  write("hr.roster.employeePeriod.correct", "EmployeeTemporalPeriod", domain(
    "packages/hr/server/domain/employee-period-correction-validation.buildEmployeePeriodCorrectionCommand",
    "packages/hr/server/employee-period-corrections.correctEmployeePeriod",
  ), { targetIdKey: "periodId", versionKey: "expectedVersion" }),
  write("hr.roster.employeeAssignment.create", "EDP", domain(
    "packages/hr/server/domain/employee-period-create-validation.buildEmployeeAssignmentCreateCommand",
    "packages/hr/server/employee-period-creates.createEmployeeAssignment",
  ), { shape: "full_record", commitMode: "activate" }),
  write("hr.roster.employeeProfile.lifecycle.record", "EmployeeLifecycleEvent", domain(
    "packages/hr/server/domain/employee-lifecycle-validation.buildEmployeeLifecycleCommand",
    "packages/hr/server/employee-lifecycle.recordEmployeeLifecycleEvent",
  ), { shape: "full_record", targetIdKey: "employeeId", commitMode: "native_transition" }),
  write("hr.roster.employment.update", "Employment", domain(
    "packages/hr/server/domain/employment-validation.buildEmploymentPageDraftCommand",
    "packages/hr/server/employments.updateEmploymentPageDraft",
  ), { shape: "change_set", commitMode: "native_transition" }),
  write("hr.roster.employment.create", "Employment", domain(
    "packages/hr/server/domain/employee-period-create-validation.buildEmploymentPeriodCreateCommand",
    "packages/hr/server/employee-period-creates.createEmploymentPeriod",
  ), { shape: "full_record", commitMode: "activate" }),
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
