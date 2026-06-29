# @workspace/hr

HR 业务包边界。当前承载模块注册、第一批 HR 纯类型、分析常量、无副作用 helper 和部分 HR server service。后续 HR 的 UI、server、types、constants、import 按目录逐步迁入。

```txt
ui/        # HR 页面组件、hooks 和前端 helper，Next route 只做薄壳
server/    # HR 查询、校验、导入和 DTO 组装
types/     # HR DTO 和领域类型
constants/ # HR 选项、字段常量和非业务事实常量
import/    # HR 导入解析、清洗和校验流程
```

已迁入：

- `types/common.ts`：HR 用户、权限 helper、通用表格配置类型。
- `types/profile.ts`：员工详情 DTO 和字段类型。
- `types/code.ts`：编码表使用的员工和编码类型。
- `constants/employee-analytics.ts`：人力分析维度标签、颜色、排序和维度列表。
- `constants/field-options.ts`：HR 民族、学历、职称、专业、合同、岗位职级等选项和归一化 helper。
- `constants/school-options.ts`：HR 学校库、白名单和学校字段归一化 helper。
- `constants/profile-fields.ts`：员工详情页字段配置。
- `constants/tab-configs/*`：员工信息表批量维护 Tab 配置。
- `utils/identity.ts`：员工电话和身份证号格式化、归一化与校验。
- `utils/department-path.ts`：HR 部门完整路径和编码路径格式化。
- `ui/analytics/contract-helpers.ts`：合同分析状态、统计和过滤 helper。
- `ui/code-helpers.ts`：编码管理排序、组合编码和详情列表 helper。
- `ui/components/{EthnicityPicker,FKInput,MajorPicker,ProfessionalTitlePicker,RankPicker,SchoolPicker}.tsx`：HR 专用字段、FK 和选项选择器，内部应走 Core `InputSurface`。
- `ui/components/GenericFieldInput.tsx`：HR 批量表格通用字段输入组件。
- `ui/profile/EmployeeDirectory.tsx`：员工资料列表入口。
- `ui/profile/EmployeeProfileClient.tsx`：员工详情主控页面。
- `ui/profile/ProfileFormControls.tsx`：员工详情字段输入和分区壳组件。
- `ui/profile/lunar-birthday.ts`：员工出生日期转农历生日 helper。
- `ui/tabs/DepartmentPositionTab.tsx`：部门岗位架构与说明书维护页面。
- `server/autocomplete.ts` 和 `server/autocomplete-config.ts`：HR FK/autocomplete 查询与搜索字段配置。
- `server/crud.ts`：HR 字段级 CRUD wrapper，统一注入 HR 权限检查并复用 Platform CRUD 契约。
- `server/companies.ts`：公司列表、创建、更新和删除。
- `server/company-directory.ts`：HR 包内公司事实查询、编码解析和缓存。
- `server/company-relations.ts`：公司关系列表、创建、更新和删除。
- `server/contracts.ts`：合同 JSON 解析、列表、创建、更新、删除和主合同同步。
- `server/departments.ts`：部门列表、创建、更新、删除和部门说明书保存。
- `server/edps.ts`：EDP 列表、创建、更新和删除。
- `server/employees.ts`：员工列表、创建账号、字段更新、删除和员工搜索。
- `server/employments.ts`：雇佣列表、创建、字段更新和禁止删除策略。
- `server/employee-profile.ts`：员工详情聚合 DTO。
- `server/employee-contracts.ts`：员工合同保存和合同 JSON 校验。
- `server/employee-edps.ts`：员工部门岗位保存和工作占比校验。
- `server/employee-history.ts`：员工详情历史记录聚合。
- `server/field-validation.ts`：HR 字段日期、选项、身份证、公司名和工作占比校验。
- `server/position-description-template-store.ts`：岗位说明书视图模板读写。
- `server/position-descriptions.ts`：岗位说明书树、列表、详情和保存。
- `server/positions.ts`：岗位列表、创建、更新和删除。
- `server/roster.ts`：HR 名册列表、导出和筛选选项。
- `server/search.ts`：HR 员工和主数据搜索语义。
- `server/domain/*-validation.ts`：HR roster 写服务的 domain command/validator。当前覆盖员工、雇佣、合同、员工详情合同/EDP、公司、公司关系、部门、岗位、EDP 和岗位说明书，统一收口 FK、日期、枚举、百分比、直接上级、合同公司、跨字段/跨行规则和归档/删除引用保护。对应 service 只消费这些 validator 后执行写库和审计，不能重新散落业务规则。

旧的 `app/hr/*` 类型和 helper 文件保留为 re-export，避免一次性改动大量页面引用。
旧的 HR UI 大组件和第一批字段组件路径保留为 re-export，Next route 和现有页面入口保持不变。
旧的 HR API route 保留为认证、权限和 HTTP 响应薄壳，业务查询和校验从 `@workspace/hr/server` 引入。
项目相关能力已从 HR 剥离到 `@workspace/work`，HR 不再维护 Project / EmployeeProject 入口。
