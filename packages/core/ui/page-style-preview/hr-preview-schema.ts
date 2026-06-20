export const profileFields = [
  { key: "employeeCode", label: "员工编号", value: "00001", required: true, type: "text" },
  { key: "name", label: "姓名", value: "张慧君", required: true, type: "text" },
  { key: "aliases", label: "别名", value: ["Jone", "大张"], type: "tags" },
  { key: "gender", label: "性别", value: "男", type: "select" },
  { key: "birthDate", label: "出生年月", value: "1965-11-12", type: "date" },
  { key: "lunarBirthday", label: "农历生日", value: "十月二十", type: "text" },
  { key: "ethnicity", label: "民族", value: "汉族", type: "picker" },
  { key: "nativePlace", label: "籍贯", value: "盐城", type: "text" },
  { key: "politicalStatus", label: "政治面貌", value: "党员", type: "select" },
  { key: "education", label: "学历", value: "博士", type: "select" },
  { key: "professionalTitle", label: "职称", value: "高级经济师", type: "picker" },
  { key: "school", label: "毕业院校", value: "VU管理学院", type: "searchable" },
  { key: "phone", label: "电话", value: "137 7004 3888", type: "tel" },
] as const;

export const assignmentFields = [
  { key: "department", label: "部门", value: "轮执委员会", type: "fk" },
  { key: "position", label: "岗位", value: "董事长", required: true, type: "fk" },
  { key: "primary", label: "主岗", value: "是", type: "select" },
  { key: "allocation", label: "工作占比", value: "99.98", type: "percent" },
  { key: "manager", label: "直接上级", value: "", placeholder: "搜索上级", type: "fk-search" },
  { key: "startDate", label: "开始日期", value: "", placeholder: "选择日期", type: "date" },
] as const;

export const departmentItems = [
  { title: "轮执委员会", subtitle: "EXC001 · L1 · 8 岗" },
  { title: "董秘办及资本证...", subtitle: "EXC100 · L2 · 4 岗" },
  { title: "职能事业部平台", subtitle: "FUN001 · L1 · 83 岗" },
] as const;
