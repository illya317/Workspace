const PERMISSION_ONLY = { eligibility: "permission_only" } as const;

const ADMINISTRATION_CONTRACTS = {
  moduleKey: "administration",
  resourceKey: "administration.contracts",
  originHrefPattern: "/administration/contracts",
} as const;

const EXTERNAL_CUSTOMERS = {
  moduleKey: "external",
  resourceKey: "external.customers",
  originHrefPattern: "/external/customers",
} as const;

const EXTERNAL_SUPPLIERS = {
  moduleKey: "external",
  resourceKey: "external.suppliers",
  originHrefPattern: "/external/suppliers",
} as const;

const HR_ROSTER = {
  moduleKey: "hr",
  resourceKey: "hr.roster",
  originHrefPattern: "/hr/roster",
} as const;

const WORK_MEETINGS = {
  moduleKey: "work",
  resourceKey: "work.meetings",
  originHrefPattern: "/work/meeting",
} as const;

const WORK_TASKS = {
  moduleKey: "work",
  resourceKey: "work.tasks",
  scopeTypes: ["personal", "department", "committee", "company"],
  originHrefPattern: "/work/me",
} as const;

const route = (method: "POST" | "PUT" | "PATCH" | "DELETE", path: string) => ({ method, path }) as const;

export const OPERATIONAL_BUSINESS_ACTION_REGISTRATIONS = [
  { ...ADMINISTRATION_CONTRACTS, ...PERMISSION_ONLY, key: "administration.contract.create", label: "创建行政合同", writeKind: "create", targetKind: "Contract", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/administration/contracts")] },
  { ...ADMINISTRATION_CONTRACTS, ...PERMISSION_ONLY, key: "administration.contract.update", label: "更新行政合同", writeKind: "update", targetKind: "Contract", directPermissionAction: "update", apiRoutes: [route("PATCH", "/api/modules/administration/contracts/:id")] },
  { ...ADMINISTRATION_CONTRACTS, ...PERMISSION_ONLY, key: "administration.contract.delete", label: "删除行政合同", writeKind: "delete", targetKind: "Contract", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/administration/contracts/:id")] },

  { ...EXTERNAL_CUSTOMERS, ...PERMISSION_ONLY, key: "external.customers.party.create", label: "创建客户", writeKind: "create", targetKind: "ExternalParty", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/external/customers")] },
  { ...EXTERNAL_CUSTOMERS, ...PERMISSION_ONLY, key: "external.customers.party.update", label: "更新客户", writeKind: "update", targetKind: "ExternalParty", directPermissionAction: "update", apiRoutes: [route("PATCH", "/api/modules/external/customers/:id")] },
  { ...EXTERNAL_CUSTOMERS, ...PERMISSION_ONLY, key: "external.customers.party.delete", label: "删除客户", writeKind: "delete", targetKind: "ExternalParty", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/external/customers/:id")] },
  { ...EXTERNAL_SUPPLIERS, ...PERMISSION_ONLY, key: "external.suppliers.party.create", label: "创建供应商", writeKind: "create", targetKind: "ExternalParty", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/external/suppliers")] },
  { ...EXTERNAL_SUPPLIERS, ...PERMISSION_ONLY, key: "external.suppliers.party.update", label: "更新供应商", writeKind: "update", targetKind: "ExternalParty", directPermissionAction: "update", apiRoutes: [route("PATCH", "/api/modules/external/suppliers/:id")] },
  { ...EXTERNAL_SUPPLIERS, ...PERMISSION_ONLY, key: "external.suppliers.party.delete", label: "删除供应商", writeKind: "delete", targetKind: "ExternalParty", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/external/suppliers/:id")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.company.create", label: "创建公司", writeKind: "create", targetKind: "Company", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/hr/roster/companies")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.company.update", label: "更新公司", writeKind: "update", targetKind: "Company", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/hr/roster/companies"), route("PUT", "/api/modules/hr/roster/companies/:id")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.company.delete", label: "删除公司", writeKind: "delete", targetKind: "Company", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/hr/roster/companies"), route("DELETE", "/api/modules/hr/roster/companies/:id")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.companyRelation.create", label: "创建公司关系", writeKind: "create", targetKind: "CompanyRelation", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/hr/roster/company-relations")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.companyRelation.update", label: "更新公司关系", writeKind: "update", targetKind: "CompanyRelation", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/hr/roster/company-relations/:id")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.companyRelation.delete", label: "删除公司关系", writeKind: "delete", targetKind: "CompanyRelation", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/hr/roster/company-relations/:id")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.employeeContract.create", label: "创建员工合同", writeKind: "create", targetKind: "EmployeeContract", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/hr/roster/contracts")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.employeeContract.update", label: "保存员工合同表", writeKind: "update", targetKind: "EmployeeContract", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/hr/roster/contracts")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.employeeContract.delete", label: "删除员工合同", writeKind: "delete", targetKind: "EmployeeContract", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/hr/roster/contracts/:id")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.departmentCode.save", label: "保存部门编码", writeKind: "save", targetKind: "DepartmentCode", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/hr/roster/department-codes")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.departmentCode.delete", label: "删除部门编码", writeKind: "delete", targetKind: "DepartmentCode", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/hr/roster/department-codes")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.edp.create", label: "创建员工部门岗位记录", writeKind: "create", targetKind: "EmployeeDepartmentPosition", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/hr/roster/edps")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.edp.update", label: "保存员工部门岗位表", writeKind: "update", targetKind: "EmployeeDepartmentPosition", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/hr/roster/edps")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.edp.delete", label: "删除员工部门岗位记录", writeKind: "delete", targetKind: "EmployeeDepartmentPosition", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/hr/roster/edps/:id")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.employment.create", label: "创建任职记录", writeKind: "create", targetKind: "Employment", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/hr/roster/employments")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.employment.update", label: "保存员工雇佣关系表", writeKind: "update", targetKind: "Employment", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/hr/roster/employments")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.positionCode.save", label: "保存岗位编码", writeKind: "save", targetKind: "PositionCode", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/hr/roster/position-codes")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.positionCode.delete", label: "删除岗位编码", writeKind: "delete", targetKind: "PositionCode", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/hr/roster/position-codes")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.positionDescriptionTemplate.save", label: "保存岗位说明模板", writeKind: "save", targetKind: "PositionDescriptionTemplate", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/hr/roster/position-description-templates")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.positionDescription.save", label: "保存岗位说明", writeKind: "save", targetKind: "PositionDescription", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/hr/roster/position-descriptions")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.positionReportOverride.save", label: "保存岗位汇报关系覆盖", writeKind: "save", targetKind: "PositionReportOverride", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/hr/roster/position-report-overrides")] },
  { ...HR_ROSTER, ...PERMISSION_ONLY, key: "hr.roster.audit.restore", label: "恢复人事历史版本", writeKind: "revise", targetKind: "HrAuditSnapshot", directPermissionAction: "revise", apiRoutes: [route("POST", "/api/modules/hr/roster/audit-log/restore")] },

  { ...WORK_MEETINGS, ...PERMISSION_ONLY, key: "work.meetings.meeting.create", label: "创建会议", writeKind: "create", targetKind: "Meeting", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/work/meetings")] },
  { ...WORK_MEETINGS, ...PERMISSION_ONLY, key: "work.meetings.meeting.update", label: "更新会议", writeKind: "update", targetKind: "Meeting", directPermissionAction: "update", apiRoutes: [route("PUT", "/api/modules/work/meetings/:id")] },
  { ...WORK_MEETINGS, ...PERMISSION_ONLY, key: "work.meetings.meeting.delete", label: "删除会议", writeKind: "delete", targetKind: "Meeting", directPermissionAction: "delete", apiRoutes: [route("DELETE", "/api/modules/work/meetings/:id")] },
  { ...WORK_MEETINGS, ...PERMISSION_ONLY, key: "work.meetings.actionCandidate.process", label: "处理会议行动候选", writeKind: "save", targetKind: "MeetingActionCandidate", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/work/meetings/:id/action-candidates")] },
  { ...WORK_MEETINGS, ...PERMISSION_ONLY, key: "work.meetings.agenda.create", label: "添加会议议程", writeKind: "create", targetKind: "MeetingAgendaItem", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/work/meetings/:id/agenda")] },
  { ...WORK_MEETINGS, ...PERMISSION_ONLY, key: "work.meetings.decision.create", label: "添加会议决议", writeKind: "create", targetKind: "MeetingDecision", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/work/meetings/:id/decisions")] },
  { ...WORK_MEETINGS, ...PERMISSION_ONLY, key: "work.meetings.minute.create", label: "添加会议纪要", writeKind: "create", targetKind: "MeetingMinute", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/work/meetings/:id/minutes")] },
  { ...WORK_MEETINGS, ...PERMISSION_ONLY, key: "work.meetings.participant.save", label: "保存会议参会人", writeKind: "save", targetKind: "MeetingParticipant", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/work/meetings/:id/participants")] },
  { ...WORK_MEETINGS, ...PERMISSION_ONLY, key: "work.meetings.proposal.create", label: "添加会议议案", writeKind: "create", targetKind: "MeetingProposal", directPermissionAction: "update", apiRoutes: [route("POST", "/api/modules/work/meetings/:id/proposals")] },
  { ...WORK_MEETINGS, ...PERMISSION_ONLY, key: "work.meetings.vote.cast", label: "提交会议表决", writeKind: "submit", targetKind: "MeetingVote", directPermissionAction: "submit", apiRoutes: [route("POST", "/api/modules/work/meetings/:id/votes/:proposalId/cast")] },
  { ...WORK_MEETINGS, ...PERMISSION_ONLY, key: "work.meetings.vote.close", label: "关闭会议表决", writeKind: "approve", targetKind: "MeetingProposal", directPermissionAction: "approve", apiRoutes: [route("POST", "/api/modules/work/meetings/:id/votes/:proposalId/close")] },
  { ...WORK_TASKS, ...PERMISSION_ONLY, key: "work.tasks.periodSchedule.create", label: "创建周期工作安排", writeKind: "create", targetKind: "WorkPeriodScheduleItem", directPermissionAction: "create", apiRoutes: [route("POST", "/api/modules/work/tasks/period-schedule")] },
] as const;
