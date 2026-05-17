import * as fs from "fs";

const schema = fs.readFileSync("prisma/schema.prisma", "utf-8");
const lines = schema.split("\n");

// All field descriptions
const DESC: Record<string, string> = {
  provider: "数据库类型",
  url: "数据库连接URL",
  binaryTargets: "跨平台编译目标",
  id: "主键",
  wxUserId: "微信用户ID",
  username: "登录用户名（自取）",
  password: "登录密码",
  name: "名称",
  employeeId: "员工编号",
  departmentId: "部门ID",
  departmentName: "部门名称",
  company: "公司名",
  companyCode: "公司编码",
  code: "编码",
  key: "唯一标识键",
  description: "说明",
  sortOrder: "排序序号",
  level: "层级",
  parentId: "上级ID",
  createdAt: "创建时间",
  updatedAt: "更新时间",
  avatar: "头像URL",
  routineItems: "日常工作模板JSON",
  apiKey: "API密钥",
  canLogin: "是否允许登录（账号状态，非权限）",
  resourceId: "资源ID → Resource",
  roleId: "角色ID → Role",
  scopeId: "范围ID（null=全局开关）",
  scopeType: "归属维度（report_group/department/personal）",
  userId: "用户ID",
  reportGroupId: "周报分组ID",
  reportId: "周报ID",
  workItemId: "关联工作清单条目ID",
  weekNumber: "周数（1-52）",
  year: "年份",
  periodType: "周期类型（weekly/monthly等）",
  taskName: "任务名称",
  notes: "备注",
  version: "版本号",
  category: "分类",
  plan: "本周计划",
  completion: "完成情况",
  nextGoal: "下周目标",
  itemsJson: "条目JSON快照",
  content: "内容",
  importance: "重要度（1-5）",
  urgency: "紧急度（1-5）",
  isArchived: "是否归档",
  isPrivate: "是否私有（仅自己可见）",
  alias: "别名",
  gender: "性别",
  ethnicity: "民族",
  hometown: "籍贯",
  politics: "政治面貌",
  education: "学历",
  title: "职称",
  school: "毕业院校",
  major: "专业",
  majorRelevant: "是否相关专业",
  phone: "电话",
  office1: "办公区1",
  office2: "办公区2",
  office3: "办公区3",
  attendance1: "考勤信息1",
  attendance2: "考勤信息2",
  joinDate: "进司时间",
  nature: "性质（全职/兼职等）",
  status: "状态（在职/离职）",
  leaveDate: "离职日期",
  deleted: "是否软删除",
  deletedTime: "删除时间",
  deletedBy: "删除操作人",
  center: "中心",
  isPrimary: "是否主岗",
  startDate: "任职开始日期",
  endDate: "任职结束日期（null=至今）",
  positionId: "岗位ID",
  managerId: "负责人编号",
  managerUserId: "负责人用户ID",
  editedBy: "编辑人用户ID",
  editedAt: "编辑时间",
  entityType: "实体类型",
  entityId: "实体主键",
  dataJson: "数据JSON快照",
};

const result: string[] = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@") || trimmed.startsWith("@")) {
    result.push(line);
    continue;
  }

  // Match field: name Type? attrs...
  const match = trimmed.match(/^(\w+)\s+(String|Int|Boolean|DateTime|Float)(\?|\[\])?\b/);
  if (match && !line.includes("//")) {
    const fieldName = match[1];
    const desc = DESC[fieldName];
    if (desc) {
      result.push(line.replace(/\s*$/, " // " + desc));
      continue;
    }
  }
  result.push(line);
}

fs.writeFileSync("prisma/schema.prisma", result.join("\n"));
console.log("Comments added.");
