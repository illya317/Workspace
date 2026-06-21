export const FIELD_LABELS: Record<string, string> = {
  name: "名称", alias: "别名", code: "编码", employeeId: "员工姓名",
  idNumber: "身份证号", otherId: "其他证件号", gender: "性别",
  birthDate: "出生年月", ethnicity: "民族", hometown: "籍贯",
  politics: "政治面貌", education: "学历", title: "职称",
  school: "毕业院校", major: "专业", phone: "电话",
  workStartDate: "参加工作时间", fullName: "全称",
  registeredCapital: "注册资本", unifiedCode: "统一社会信用代码",
  bankName: "开户行", registeredAddress: "办公地址",
  registeredDate: "注册时间", legalPerson: "法定代表人",
  currentCompany: "当前公司", joinDate: "入职日期", leaveDate: "离职日期",
  leaveReason: "离职原因", officeLocation: "办公地点",
  insuranceStatus: "参保状态",
  isActive: "在职", isPrimary: "主岗", startDate: "开始日期", endDate: "结束日期",
  personnelType: "人员类型", rank: "职级", reportTo: "直接上级", reportTo2: "第二汇报线",
  workPercent: "工作占比", isResearch: "研发", description: "说明", type: "类型",
  departmentName: "所属部门", positionPurpose: "岗位目的", summary: "职责概要",
  headcount: "编制人数", effectiveDate: "生效日期", sourceFile: "源文件",
  shareRatio: "持股比例", isConsolidated: "并表", sortOrder: "排序",
  queryGroup: "查询分组", level: "层级", parentId: "上级", managerUserId: "负责人",
  departmentId: "所属部门", positionId: "岗位", positionDescriptionId: "岗位说明书",
  projectId: "项目", childId: "下级",
  targetType: "目标类型", date: "日期", taskName: "任务名称", notes: "备注",
  category: "分类", plan: "项目规划", completion: "完成情况", nextGoal: "下周目标",
  content: "内容", importance: "重要度", urgency: "紧急度",
};

export function label(field: string) {
  return FIELD_LABELS[field] || field;
}

export function formatVal(value: string) {
  if (value === "true") return "是";
  if (value === "false") return "否";
  return value.length > 40 ? `${value.slice(0, 40)}...` : value;
}
