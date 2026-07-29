import "server-only";

import type { CompanyDirectoryRecord } from "@workspace/platform/server/company-directory";
import { defineWorkspaceAnalysisReadModel } from "@workspace/platform/server/workspace-analysis-read-model";
import type { ContractRow } from "@workspace/hr/types";

import type { PositionListItem } from "./positions";
import { HR_WORKSPACE_ANALYSIS_GOVERNANCE_SOURCE_REGISTRATIONS } from "./workspace-analysis-governance-sources";
import { HR_WORKSPACE_ANALYSIS_PERFORMANCE_SOURCE_REGISTRATIONS } from "./workspace-analysis-performance-sources";
import {
  child,
  defaultLimits,
  defaultPagination,
  field,
  mixedEmploymentScopes,
  nestedValueLimits,
  nestedValuePagination,
  omit,
  workspaceScopes,
} from "./workspace-analysis-source-defaults";

type EmployeeListRow = {
  id: number;
  employeeId: string;
  idNumber: string | null;
  otherId: string | null;
  name: string;
  alias: string | null;
  gender: boolean | null;
  birthDate: string | null;
  ethnicity: string | null;
  hometown: string | null;
  politics: string | null;
  education: string | null;
  title: string | null;
  school: string | null;
  major: string | null;
  phone: string | null;
  workStartDate: string | null;
  userId: number | null;
  editedBy: number | null;
  editedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  employments: readonly unknown[];
  positions: readonly unknown[];
  positionName?: string | null;
  directDepartmentName?: string | null;
  currentCompany?: string | null;
  userIdName?: string;
  username?: string | null;
  accountCanLogin?: boolean;
};

type EmploymentListRow = {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  positionNames: string;
  isActive: boolean;
  currentCompany: string | null;
  joinDate: string | null;
  leaveDate: string | null;
  leaveReason: string | null;
  leaveNote: string | null;
  officeLocation: string | null;
  personnelType: string | null;
  rank: string | null;
  title: string | null;
  contracts: string | null;
};

type EdpListRow = {
  id: number;
  employeeId: number;
  employeeName: string;
  reportingCompanyId: number | null;
  reportingCompanyName: string;
  departmentId: number | null;
  departmentName: string;
  positionId: number | null;
  positionReportOverrideId: number | null;
  positionName: string;
  isPrimary: boolean;
  startDate: string | null;
  endDate: string | null;
  reportTo: string | null;
  allocationWeight: string | null;
};

type DepartmentListRow = {
  id: number;
  code: string;
  name: string;
  alias: string | null;
  company: string;
  hierarchyKind: string;
  level: number;
  levelCode: string;
  levelLabel: string;
  parentId: number | null;
  parentName: string | null;
  managerPositionId: number | null;
  managerPositionName: string | null;
  managerEmployeeIds: readonly number[];
  managerEmployeeNames: readonly string[];
  managerNames: readonly string[];
  managerName: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  version: number;
  headcount: number;
  children: readonly unknown[];
  descriptions: readonly unknown[];
};

type PositionAnalysisRow = PositionListItem & {
  functionalPlacementCount: number;
};

type NestedDescriptionValueRow = {
  rowKey: string;
  parentId: number;
  parentCode: string;
  parentName: string;
  descriptionId: number | null;
  sourceFile: string | null;
  codeRaw: string | null;
  path: string;
  valueKind: string;
  textValue: string | null;
  numberValue: number | null;
  booleanValue: boolean | null;
};

type DepartmentManagerRow = {
  rowKey: string;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  employeeId: number | null;
  employeeName: string | null;
  ordinal: number;
};

export const HR_EMPLOYEES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<EmployeeListRow>()({
  sourceKey: "hr.employees",
  version: 1,
  label: "HR 员工主数据",
  description: "以一名员工为粒度，复用人事基础资料员工列表的读取权限；敏感级只作字段标签，不形成第二道查询权限。",
  apiPath: "/api/modules/hr/roster/employees",
  rowsPath: "employees",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: [
    { key: "isActive", label: "在职状态", description: "按员工是否存在在职雇佣记录筛选。", kind: "boolean", queryKey: "isActive" },
    { key: "personnelType", label: "人员类型", description: "按雇佣记录中的人员类型筛选。", kind: "text", queryKey: "personnelType" },
  ],
  fields: {
    id: field({ label: "员工内部 ID", description: "员工记录的稳定内部标识。", valueKind: "integer", sensitivity: "internal" }),
    employeeId: field({ label: "员工编号", description: "员工业务编号。", valueKind: "text", sensitivity: "confidential" }),
    idNumber: field({ label: "身份证号", description: "员工身份证号码；沿用 HR 花名册读取权限。", valueKind: "text", sensitivity: "restricted", exportPolicy: "masked" }),
    otherId: field({ label: "其他证件号", description: "员工其他证件号码；沿用 HR 花名册读取权限。", valueKind: "text", sensitivity: "restricted", exportPolicy: "masked" }),
    name: field({ label: "姓名", description: "员工姓名。", valueKind: "text", sensitivity: "confidential" }),
    alias: field({ label: "别名", description: "员工别名的原始列表文本。", valueKind: "text", sensitivity: "confidential" }),
    gender: field({ label: "性别", description: "员工性别布尔值。", valueKind: "boolean", sensitivity: "confidential" }),
    birthDate: field({ label: "出生日期", description: "员工出生日期。", valueKind: "date", sensitivity: "restricted" }),
    ethnicity: field({ label: "民族", description: "员工民族。", valueKind: "text", sensitivity: "confidential" }),
    hometown: field({ label: "籍贯", description: "员工籍贯。", valueKind: "text", sensitivity: "confidential" }),
    politics: field({ label: "政治面貌", description: "员工政治面貌。", valueKind: "text", sensitivity: "restricted" }),
    education: field({ label: "学历", description: "员工最高学历。", valueKind: "text", sensitivity: "confidential" }),
    title: field({ label: "职称", description: "员工主数据职称。", valueKind: "text", sensitivity: "confidential" }),
    school: field({ label: "毕业院校", description: "员工毕业院校。", valueKind: "text", sensitivity: "confidential" }),
    major: field({ label: "专业", description: "员工所学专业。", valueKind: "text", sensitivity: "confidential" }),
    phone: field({ label: "电话", description: "员工联系电话；沿用 HR 花名册读取权限。", valueKind: "text", sensitivity: "restricted", exportPolicy: "masked" }),
    workStartDate: field({ label: "参加工作日期", description: "员工首次参加工作的日期。", valueKind: "date", sensitivity: "confidential" }),
    userId: field({ label: "关联账号 ID", description: "员工绑定的 Workspace 账号内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    editedBy: field({ label: "最后编辑人 ID", description: "公开员工列表返回的最后编辑账号 ID。", valueKind: "integer", sensitivity: "internal" }),
    editedAt: field({ label: "最后编辑时间", description: "公开员工列表返回的最后编辑时间。", valueKind: "date", sensitivity: "internal" }),
    version: field({ label: "员工版本", description: "员工主数据并发版本号。", valueKind: "integer", sensitivity: "internal" }),
    createdAt: field({ label: "记录创建时间", description: "员工主数据记录创建时间；不等同于入职日期。", valueKind: "date", sensitivity: "internal" }),
    updatedAt: field({ label: "记录更新时间", description: "员工主数据记录最后更新时间；不等同于业务变更日期。", valueKind: "date", sensitivity: "internal" }),
    employments: child("hr.employments", "雇佣关系列表拆为独立的雇佣记录数据源。"),
    positions: child("hr.edps", "部门岗位关系列表拆为独立的 EDP 数据源。"),
    positionName: field({ label: "主岗位", description: "员工列表按主岗优先派生的岗位名称。", valueKind: "text", sensitivity: "confidential" }),
    directDepartmentName: field({ label: "直属部门", description: "员工列表按主岗优先派生的直属部门名称。", valueKind: "text", sensitivity: "confidential" }),
    currentCompany: field({ label: "当前公司", description: "优先取主合同公司，其次取首个合同公司或雇佣记录公司。", valueKind: "text", sensitivity: "confidential" }),
    userIdName: field({ label: "关联账号员工名", description: "关联账号绑定员工的展示名称。", valueKind: "text", sensitivity: "confidential" }),
    username: field({ label: "账号用户名", description: "员工关联 Workspace 账号的用户名。", valueKind: "text", sensitivity: "confidential" }),
    accountCanLogin: field({ label: "账号可登录", description: "关联账号当前是否允许登录。", valueKind: "boolean", sensitivity: "internal" }),
  },
  pagination: defaultPagination,
  limits: defaultLimits,
});

export const HR_EMPLOYMENTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<EmploymentListRow>()({
  sourceKey: "hr.employments",
  version: 1,
  label: "HR 雇佣记录",
  description: "以一条雇佣关系为粒度；公开列表的标量字段全部可用，原始合同 JSON 拆到合同数据源。",
  apiPath: "/api/modules/hr/roster/employments",
  rowsPath: "items",
  totalPath: "total",
  scopes: mixedEmploymentScopes,
  parameters: [
    { key: "isActive", label: "在职状态", description: "是否为在职雇佣记录。", kind: "boolean", queryKey: "isActive" },
    { key: "company", label: "当前公司", description: "主合同公司或当前公司名称的精确值。", kind: "text", queryKey: "company" },
    { key: "personnelType", label: "人员类型", description: "雇佣记录中的人员类型。", kind: "text", queryKey: "personnelType" },
  ],
  fields: {
    id: field({ label: "雇佣记录 ID", description: "雇佣记录的稳定内部标识。", valueKind: "integer", sensitivity: "internal" }),
    employeeId: field({ label: "员工内部 ID", description: "雇佣记录关联的员工内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    employeeCode: field({ label: "员工编号", description: "Employee.employeeId 业务工号。", valueKind: "text", sensitivity: "confidential" }),
    employeeName: field({ label: "姓名", description: "员工主数据姓名。", valueKind: "text", sensitivity: "confidential" }),
    positionNames: field({ label: "岗位名称", description: "公开雇佣列表返回的岗位名称合集，可能包含历史或未来任职。", valueKind: "text", sensitivity: "confidential" }),
    isActive: field({ label: "在职", description: "当前雇佣记录是否在职。", valueKind: "boolean", sensitivity: "internal" }),
    currentCompany: field({ label: "当前公司", description: "优先取主合同公司，其次取首个合同公司或雇佣记录公司。", valueKind: "text", sensitivity: "internal" }),
    joinDate: field({ label: "入职日期", description: "当前雇佣记录的入职日期。", valueKind: "date", sensitivity: "confidential" }),
    leaveDate: field({ label: "离职日期", description: "当前雇佣记录的离职日期。", valueKind: "date", sensitivity: "confidential" }),
    leaveReason: field({ label: "离职原因", description: "雇佣记录维护的离职原因；复用 hr.roster.read，不增加字段级授权。", valueKind: "text", sensitivity: "restricted" }),
    leaveNote: field({ label: "离职补充说明", description: "雇佣记录维护的离职补充说明；复用 hr.roster.read，不增加字段级授权。", valueKind: "text", sensitivity: "restricted" }),
    officeLocation: field({ label: "办公地点", description: "雇佣记录维护的办公地点。", valueKind: "text", sensitivity: "confidential" }),
    personnelType: field({ label: "人员类型", description: "雇佣记录维护的人员类型。", valueKind: "text", sensitivity: "confidential" }),
    rank: field({ label: "职级", description: "雇佣记录维护的职级。", valueKind: "text", sensitivity: "confidential" }),
    title: field({ label: "职务", description: "雇佣记录维护的职务；不等同于岗位。", valueKind: "text", sensitivity: "internal" }),
    contracts: child("hr.contracts", "原始合同 JSON 是非标量字段，拆为规范化的一合同一行数据源。"),
  },
  pagination: defaultPagination,
  limits: defaultLimits,
});

export const HR_EDPS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<EdpListRow>()({
  sourceKey: "hr.edps",
  version: 2,
  label: "HR 部门岗位关系",
  description: "以一条员工—部门—岗位关系为粒度，复用 EDP 列表的稳定分页读取。",
  apiPath: "/api/modules/hr/roster/edps",
  rowsPath: "positions",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: [
    { key: "isActive", label: "员工在职状态", description: "按员工是否存在在职雇佣记录筛选。", kind: "boolean", queryKey: "isActive" },
  ],
  fields: {
    id: field({ label: "EDP ID", description: "员工部门岗位关系的稳定内部标识。", valueKind: "integer", sensitivity: "internal" }),
    employeeId: field({ label: "员工内部 ID", description: "EDP 关联的员工内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    employeeName: field({ label: "员工姓名", description: "EDP 关联的员工姓名。", valueKind: "text", sensitivity: "confidential" }),
    reportingCompanyId: field({ label: "汇报公司 ID", description: "EDP 关联的汇报公司内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    reportingCompanyName: field({ label: "汇报公司", description: "EDP 关联的汇报公司名称。", valueKind: "text", sensitivity: "internal" }),
    departmentId: field({ label: "部门 ID", description: "EDP 直接关联的部门内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    departmentName: field({ label: "部门", description: "EDP 直接关联的部门名称。", valueKind: "text", sensitivity: "internal" }),
    positionId: field({ label: "岗位 ID", description: "EDP 关联的岗位内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    positionReportOverrideId: field({ label: "特殊汇报规则 ID", description: "EDP 关联的特殊汇报规则内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    positionName: field({ label: "岗位", description: "EDP 关联的岗位名称。", valueKind: "text", sensitivity: "internal" }),
    isPrimary: field({ label: "主岗", description: "该 EDP 是否为员工主岗。", valueKind: "boolean", sensitivity: "internal" }),
    startDate: field({ label: "开始日期", description: "该部门岗位关系的开始日期。", valueKind: "date", sensitivity: "confidential" }),
    endDate: field({ label: "结束日期", description: "该部门岗位关系的结束日期。", valueKind: "date", sensitivity: "confidential" }),
    reportTo: field({ label: "直接上级", description: "EDP 公开列表返回的直接上级展示值。", valueKind: "text", sensitivity: "confidential" }),
    allocationWeight: field({ label: "岗位投入权重", description: "EDP 维护的正数相对投入权重；折算占比按查询业务日动态派生。", valueKind: "text", sensitivity: "internal" }),
  },
  pagination: defaultPagination,
  limits: defaultLimits,
});

export const HR_CONTRACTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<ContractRow>()({
  sourceKey: "hr.contracts",
  version: 1,
  label: "HR 劳动合同",
  description: "以一份规范化劳动合同为粒度；原始 Employment.contracts JSON 在 HR owner 内展开后分页。",
  apiPath: "/api/modules/hr/roster/contracts",
  rowsPath: "contracts",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: [
    { key: "isActive", label: "雇佣在职状态", description: "按合同所属雇佣记录的在职状态筛选。", kind: "boolean", queryKey: "isActive" },
  ],
  fields: {
    isNew: omit("controlPlane", "仅用于员工档案尚未保存的本地草稿，不是持久化合同事实。"),
    id: field({ label: "合同合成 ID", description: "规范化协议 UID 或由雇佣记录与合同序号组成的兼容标识。", valueKind: "text", sensitivity: "internal" }),
    agreementUid: field({ label: "协议 UID", description: "规范化雇佣协议 anchor 的稳定标识；legacy 行为空。", valueKind: "text", sensitivity: "internal" }),
    employmentId: field({ label: "雇佣记录 ID", description: "合同所属雇佣记录内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    employeeId: field({ label: "员工编号", description: "合同所属员工的业务编号。", valueKind: "text", sensitivity: "confidential" }),
    employeeName: field({ label: "员工姓名", description: "合同所属员工姓名。", valueKind: "text", sensitivity: "confidential" }),
    company: field({ label: "签约公司", description: "劳动合同签约公司。", valueKind: "text", sensitivity: "confidential" }),
    isPrimary: field({ label: "主合同", description: "是否为员工主合同。", valueKind: "boolean", sensitivity: "internal" }),
    isInsuredHere: field({ label: "在此参保", description: "由参保状态映射得到的兼容布尔值。", valueKind: "boolean", sensitivity: "confidential" }),
    insuranceStatus: field({ label: "参保状态", description: "合同记录维护的参保状态。", valueKind: "text", sensitivity: "confidential" }),
    legalRelation: field({ label: "法律关系", description: "合同记录维护的法律关系。", valueKind: "text", sensitivity: "confidential" }),
    contractType: field({ label: "合同类型", description: "劳动合同类型。", valueKind: "text", sensitivity: "confidential" }),
    employmentForm: field({ label: "用工形式", description: "劳动用工形式。", valueKind: "text", sensitivity: "confidential" }),
    firstContractStartDate: field({ label: "首签开始", description: "首份合同开始日期。", valueKind: "date", sensitivity: "confidential" }),
    firstContractEndDate: field({ label: "首签到期", description: "首份合同约定到期日期。", valueKind: "date", sensitivity: "confidential" }),
    secondContractStartDate: field({ label: "续签一开始", description: "第一次续签开始日期。", valueKind: "date", sensitivity: "confidential" }),
    secondContractEndDate: field({ label: "续签一到期", description: "第一次续签约定到期日期。", valueKind: "date", sensitivity: "confidential" }),
    thirdContractStartDate: field({ label: "续签二开始", description: "第二次续签开始日期。", valueKind: "date", sensitivity: "confidential" }),
    thirdContractEndDate: field({ label: "续签二到期", description: "第二次续签约定到期日期。", valueKind: "date", sensitivity: "confidential" }),
    permanentContractDate: field({ label: "无固定期限日期", description: "转为无固定期限合同的日期。", valueKind: "date", sensitivity: "confidential" }),
    expiryDate: field({ label: "到期日期", description: "合同当前约定到期日期。", valueKind: "date", sensitivity: "confidential" }),
    confidentialityDate: field({ label: "保密协议日期", description: "保密协议签署日期。", valueKind: "date", sensitivity: "restricted" }),
    nonCompeteDate: field({ label: "竞业限制日期", description: "竞业限制协议签署日期。", valueKind: "date", sensitivity: "restricted" }),
    endDate: field({ label: "结束日期", description: "合同真实结束日期。", valueKind: "date", sensitivity: "confidential" }),
    recordState: field({ label: "协议记录状态", description: "规范化协议 anchor 的记录状态。", valueKind: "text", sensitivity: "internal" }),
    temporalState: field({ label: "协议时间状态", description: "协议相对查询业务日的当前、未来或历史分类。", valueKind: "text", sensitivity: "internal" }),
    version: field({ label: "协议并发版本", description: "规范化协议的乐观并发版本；legacy 行为空。", valueKind: "integer", sensitivity: "internal" }),
    source: field({ label: "协议数据来源", description: "区分规范化协议与 legacy JSON 兼容读取。", valueKind: "text", sensitivity: "internal" }),
    migrationState: field({ label: "协议迁移状态", description: "标识协议已规范化、legacy 只读或 legacy 歧义状态。", valueKind: "text", sensitivity: "internal" }),
    missingFields: omit("nonScalar", "协议缺失字段是详情页数据质量提示，不作为合同行的标量分析字段。"),
    currentRevisionUid: field({ label: "当前修订 UID", description: "规范化协议当前发布修订的稳定标识。", valueKind: "text", sensitivity: "internal" }),
    terms: omit("nonScalar", "协议期限是带生命周期状态的嵌套列表，不作为合同行的标量分析字段。"),
    revisions: omit("nonScalar", "协议内容修订是嵌套版本列表，不作为合同行的标量分析字段。"),
    attachments: omit("nonScalar", "协议附件是独立二进制与元数据记录，不作为合同行的标量分析字段。"),
  },
  pagination: defaultPagination,
  limits: defaultLimits,
});

export const HR_DEPARTMENTS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<DepartmentListRow>()({
  sourceKey: "hr.departments",
  version: 1,
  label: "HR 组织主数据",
  description: "以一个组织单元为粒度，展示全公司组织结构、负责人和编制事实。",
  apiPath: "/api/modules/hr/roster/departments",
  rowsPath: "departments",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: [
    { key: "archived", label: "已归档组织", description: "是否读取已归档组织；默认读取现行组织。", kind: "boolean", queryKey: "archived" },
  ],
  fields: {
    id: field({ label: "组织 ID", description: "组织单元稳定内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    code: field({ label: "组织编码", description: "组织业务编码。", valueKind: "text", sensitivity: "internal" }),
    name: field({ label: "组织名称", description: "组织单元名称。", valueKind: "text", sensitivity: "internal" }),
    alias: field({ label: "组织别名", description: "组织单元别名。", valueKind: "text", sensitivity: "internal" }),
    company: field({ label: "所属公司", description: "按组织编码解析的公司名称。", valueKind: "text", sensitivity: "internal" }),
    hierarchyKind: field({ label: "组织体系", description: "M 为管理体系，G 为治理体系。", valueKind: "text", sensitivity: "internal" }),
    level: field({ label: "层级数字", description: "组织层级数字。", valueKind: "integer", sensitivity: "internal" }),
    levelCode: field({ label: "层级编码", description: "组织体系与层级组合编码。", valueKind: "text", sensitivity: "internal" }),
    levelLabel: field({ label: "层级名称", description: "组织层级的业务展示名称。", valueKind: "text", sensitivity: "internal" }),
    parentId: field({ label: "上级组织 ID", description: "直接上级组织内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    parentName: field({ label: "上级组织", description: "直接上级组织名称。", valueKind: "text", sensitivity: "internal" }),
    managerPositionId: field({ label: "负责人岗位 ID", description: "组织负责人岗位内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    managerPositionName: field({ label: "负责人岗位", description: "组织负责人岗位名称。", valueKind: "text", sensitivity: "internal" }),
    managerEmployeeIds: child("hr.department-managers", "负责人 ID 与姓名数组规范化为一负责人一行的关系源。"),
    managerEmployeeNames: child("hr.department-managers", "负责人 ID 与姓名数组规范化为一负责人一行的关系源。"),
    managerNames: child("hr.department-managers", "兼容负责人姓名数组与 managerEmployeeNames 共用同一规范化关系源。"),
    managerName: field({ label: "组织负责人", description: "组织负责人的合并展示名称。", valueKind: "text", sensitivity: "confidential" }),
    isArchived: field({ label: "已归档", description: "组织是否已归档。", valueKind: "boolean", sensitivity: "internal" }),
    archivedAt: field({ label: "归档日期", description: "组织归档时间。", valueKind: "date", sensitivity: "internal" }),
    version: field({ label: "组织版本", description: "组织主数据版本号。", valueKind: "integer", sensitivity: "internal" }),
    headcount: field({ label: "岗位关系数", description: "该组织关联的 EDP 记录数量，不等同于当前在职人数。", valueKind: "integer", sensitivity: "internal" }),
    children: omit("derivedDuplicate", "子组织数组可由本数据源的 parentId 关系重建。"),
    descriptions: child("hr.department-descriptions", "组织说明书含嵌套 details，已拆为稳定的字段明细数据源。"),
  },
  pagination: defaultPagination,
  limits: defaultLimits,
});

export const HR_POSITIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<PositionAnalysisRow>()({
  sourceKey: "hr.positions",
  version: 1,
  label: "HR 岗位主数据",
  description: "以一个岗位为粒度，展示组织归属、汇报关系、岗位说明与编制事实。",
  apiPath: "/api/modules/hr/roster/positions",
  rowsPath: "positions",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: [
    { key: "archived", label: "已归档岗位", description: "是否读取已归档岗位；默认读取现行岗位。", kind: "boolean", queryKey: "archived" },
  ],
  fields: {
    id: field({ label: "岗位 ID", description: "岗位稳定内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    code: field({ label: "岗位编码", description: "岗位业务编码。", valueKind: "text", sensitivity: "internal" }),
    codeRaw: field({ label: "岗位原始编码", description: "岗位说明书保留的原始来源编码。", valueKind: "text", sensitivity: "internal" }),
    name: field({ label: "岗位名称", description: "岗位名称。", valueKind: "text", sensitivity: "internal" }),
    alias: field({ label: "岗位别名", description: "岗位别名。", valueKind: "text", sensitivity: "internal" }),
    company: field({ label: "所属公司", description: "按岗位编码解析的公司名称。", valueKind: "text", sensitivity: "internal" }),
    departmentId: field({ label: "所属组织 ID", description: "岗位所属组织内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    departmentCode: field({ label: "所属组织编码", description: "岗位所属组织编码。", valueKind: "text", sensitivity: "internal" }),
    departmentName: field({ label: "所属组织", description: "岗位所属组织名称。", valueKind: "text", sensitivity: "internal" }),
    positionDescriptionId: field({ label: "岗位说明书 ID", description: "岗位说明书内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    positionDescriptionName: field({ label: "说明书岗位名称", description: "岗位说明书按岗位主数据派生的名称。", valueKind: "text", sensitivity: "internal" }),
    positionDescriptionCode: field({ label: "说明书岗位编码", description: "岗位说明书按岗位主数据派生的编码。", valueKind: "text", sensitivity: "internal" }),
    positionDescriptionDepartmentName: field({ label: "说明书所属组织", description: "岗位说明书按岗位主数据派生的组织名称。", valueKind: "text", sensitivity: "internal" }),
    positionDescriptionDetails: child("hr.position-descriptions", "说明书 details 是嵌套 JSON，已拆为稳定的字段明细数据源。"),
    reportTo: field({ label: "汇报岗位", description: "岗位自然汇报对象名称。", valueKind: "text", sensitivity: "internal" }),
    reportToPositionId: field({ label: "汇报岗位 ID", description: "岗位自然汇报对象内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    summary: field({ label: "岗位摘要", description: "岗位说明书摘要。", valueKind: "text", sensitivity: "internal" }),
    positionPurpose: field({ label: "岗位目的", description: "岗位说明书维护的岗位目的。", valueKind: "text", sensitivity: "internal" }),
    headcountPlan: field({ label: "计划编制", description: "岗位说明书维护的计划编制人数。", valueKind: "integer", sensitivity: "internal" }),
    version: field({ label: "岗位版本", description: "岗位主数据版本号。", valueKind: "integer", sensitivity: "internal" }),
    positionDescriptionVersion: field({ label: "说明书版本", description: "岗位说明书业务版本。", valueKind: "text", sensitivity: "internal" }),
    positionDescriptionSequence: field({ label: "说明书修订序号", description: "查询业务日选中的岗位说明书 revision 序号。", valueKind: "integer", sensitivity: "internal" }),
    effectiveDate: field({ label: "说明书生效日期", description: "岗位说明书生效日期。", valueKind: "date", sensitivity: "internal" }),
    sourceFile: field({ label: "说明书来源文件", description: "岗位说明书公开列表返回的来源文件标识。", valueKind: "text", sensitivity: "confidential" }),
    headcount: field({ label: "岗位关系数", description: "该岗位关联的 EDP 记录数量，不等同于当前在职人数。", valueKind: "integer", sensitivity: "internal" }),
    positionReportOverrideCount: field({ label: "特殊汇报规则数", description: "岗位作为来源岗位的特殊汇报规则数量。", valueKind: "integer", sensitivity: "internal" }),
    functionalPlacementCount: field({ label: "职能归属规则数", description: "与特殊汇报规则数相同的兼容展示字段。", valueKind: "integer", sensitivity: "internal" }),
    isArchived: field({ label: "已归档", description: "岗位是否已归档。", valueKind: "boolean", sensitivity: "internal" }),
    archivedAt: field({ label: "归档日期", description: "岗位归档时间。", valueKind: "date", sensitivity: "internal" }),
  },
  pagination: defaultPagination,
  limits: defaultLimits,
});

const nestedDescriptionFields = {
  rowKey: field({ label: "明细行键", description: "由父记录、说明书和字段路径组成的稳定行键。", valueKind: "text", sensitivity: "internal" }),
  parentId: field({ label: "父记录 ID", description: "说明书所属组织或岗位的内部 ID。", valueKind: "integer", sensitivity: "internal" }),
  parentCode: field({ label: "父记录编码", description: "说明书所属组织或岗位的业务编码。", valueKind: "text", sensitivity: "internal" }),
  parentName: field({ label: "父记录名称", description: "说明书所属组织或岗位的名称。", valueKind: "text", sensitivity: "internal" }),
  descriptionId: field({ label: "说明书 ID", description: "说明书内部 ID；岗位尚未建立说明书时为空。", valueKind: "integer", sensitivity: "internal" }),
  sourceFile: field({ label: "来源文件", description: "公开 DTO 返回的说明书来源文件标识。", valueKind: "text", sensitivity: "confidential" }),
  codeRaw: field({ label: "原始编码", description: "说明书保留的原始来源编码。", valueKind: "text", sensitivity: "internal" }),
  path: field({ label: "字段路径", description: "说明书动态 details 中的确定性字段路径。", valueKind: "text", sensitivity: "internal" }),
  valueKind: field({ label: "值类型", description: "字段值的原始标量类型或空容器类型。", valueKind: "text", sensitivity: "internal" }),
  textValue: field({ label: "文本值", description: "字段值的无损文本表示；数字和布尔值同时保留专用列。", valueKind: "text", sensitivity: "confidential" }),
  numberValue: field({ label: "数值", description: "字段原值为数字时的数值列，否则为空。", valueKind: "number", sensitivity: "confidential" }),
  booleanValue: field({ label: "布尔值", description: "字段原值为布尔值时的布尔列，否则为空。", valueKind: "boolean", sensitivity: "confidential" }),
} as const;

export const HR_DEPARTMENT_DESCRIPTIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<NestedDescriptionValueRow>()({
  sourceKey: "hr.department-descriptions",
  version: 1,
  label: "HR 组织说明书字段",
  description: "以一条组织说明书动态字段为粒度，把公开 descriptions/details 完整规范化为可筛选标量行。",
  apiPath: "/api/modules/hr/roster/departments",
  rowsPath: "departments.descriptions",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: [
    { key: "archived", label: "已归档组织", description: "是否读取已归档组织的说明书。", kind: "boolean", queryKey: "archived" },
  ],
  fields: nestedDescriptionFields,
  pagination: nestedValuePagination,
  limits: nestedValueLimits,
});

export const HR_DEPARTMENT_MANAGERS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<DepartmentManagerRow>()({
  sourceKey: "hr.department-managers",
  version: 1,
  label: "HR 组织负责人",
  description: "以一名组织负责人为粒度，保留公开部门 DTO 中负责人 ID 与姓名数组的对应关系。",
  apiPath: "/api/modules/hr/roster/departments",
  rowsPath: "departments.managerEmployeeIds",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: [
    { key: "archived", label: "已归档组织", description: "是否读取已归档组织的负责人。", kind: "boolean", queryKey: "archived" },
  ],
  fields: {
    rowKey: field({ label: "关系行键", description: "由组织和数组序号组成的稳定行键。", valueKind: "text", sensitivity: "internal" }),
    departmentId: field({ label: "组织 ID", description: "负责人所属组织 ID。", valueKind: "integer", sensitivity: "internal" }),
    departmentCode: field({ label: "组织编码", description: "负责人所属组织业务编码。", valueKind: "text", sensitivity: "internal" }),
    departmentName: field({ label: "组织名称", description: "负责人所属组织名称。", valueKind: "text", sensitivity: "internal" }),
    employeeId: field({ label: "员工 ID", description: "公开负责人数组中的员工内部 ID。", valueKind: "integer", sensitivity: "internal" }),
    employeeName: field({ label: "负责人姓名", description: "公开负责人数组中的员工姓名。", valueKind: "text", sensitivity: "confidential" }),
    ordinal: field({ label: "数组序号", description: "负责人在公开 DTO 数组中的零基序号。", valueKind: "integer", sensitivity: "internal" }),
  },
  pagination: nestedValuePagination,
  limits: nestedValueLimits,
});

export const HR_POSITION_DESCRIPTIONS_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<NestedDescriptionValueRow>()({
  sourceKey: "hr.position-descriptions",
  version: 1,
  label: "HR 岗位说明书字段",
  description: "以一条岗位说明书动态字段为粒度，把公开 positionDescriptionDetails 完整规范化为可筛选标量行。",
  apiPath: "/api/modules/hr/roster/positions",
  rowsPath: "positions.positionDescriptionDetails",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: [
    { key: "archived", label: "已归档岗位", description: "是否读取已归档岗位的说明书。", kind: "boolean", queryKey: "archived" },
  ],
  fields: nestedDescriptionFields,
  pagination: nestedValuePagination,
  limits: nestedValueLimits,
});

export const HR_COMPANIES_ANALYSIS_SOURCE = defineWorkspaceAnalysisReadModel<CompanyDirectoryRecord>()({
  sourceKey: "hr.companies",
  version: 1,
  label: "HR 公司目录",
  description: "以一个公司主数据记录为粒度，复用 HR 公司目录的读取权限。",
  apiPath: "/api/modules/hr/roster/companies",
  rowsPath: "companies",
  totalPath: "total",
  scopes: workspaceScopes,
  parameters: [
    { key: "activeOnly", label: "仅有效公司", description: "是否只读取有效公司。", kind: "boolean", queryKey: "active" },
  ],
  fields: {
    code: field({ label: "公司编码", description: "公司业务编码。", valueKind: "text", sensitivity: "internal" }),
    name: field({ label: "公司名称", description: "公司法定主体名称。", valueKind: "text", sensitivity: "internal" }),
    isActive: field({ label: "有效", description: "公司目录记录是否有效。", valueKind: "boolean", sensitivity: "internal" }),
    managementGroup: field({ label: "管理组", description: "公司所属管理组。", valueKind: "text", sensitivity: "internal" }),
    codePoolCode: field({ label: "编码池代码", description: "公司共用的编码池代码。", valueKind: "text", sensitivity: "internal" }),
    sortOrder: field({ label: "排序", description: "公司目录排序值。", valueKind: "integer", sensitivity: "internal" }),
  },
  pagination: defaultPagination,
  limits: defaultLimits,
});

export const HR_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS = [
  HR_EMPLOYEES_ANALYSIS_SOURCE,
  HR_EMPLOYMENTS_ANALYSIS_SOURCE,
  HR_EDPS_ANALYSIS_SOURCE,
  HR_CONTRACTS_ANALYSIS_SOURCE,
  HR_DEPARTMENTS_ANALYSIS_SOURCE,
  HR_DEPARTMENT_DESCRIPTIONS_ANALYSIS_SOURCE,
  HR_DEPARTMENT_MANAGERS_ANALYSIS_SOURCE,
  HR_POSITIONS_ANALYSIS_SOURCE,
  HR_POSITION_DESCRIPTIONS_ANALYSIS_SOURCE,
  HR_COMPANIES_ANALYSIS_SOURCE,
  ...HR_WORKSPACE_ANALYSIS_GOVERNANCE_SOURCE_REGISTRATIONS,
  ...HR_WORKSPACE_ANALYSIS_PERFORMANCE_SOURCE_REGISTRATIONS,
] as const;
