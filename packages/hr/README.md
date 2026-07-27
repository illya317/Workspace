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
- `ui/components/{EthnicityPicker,MajorPicker,ProfessionalTitlePicker,RankPicker,SchoolPicker}.tsx`：HR 专用选项选择器，内部应走 Core `InputSurface`。
- `ui/components/GenericFieldInput.tsx`：HR 批量表格编辑字段到 Core input spec 的映射。
- `ui/profile/EmployeeDirectory.tsx`：员工资料列表入口。
- `ui/profile/EmployeeProfileClient.tsx`：员工详情主控页面。
- `ui/profile/ProfileFormControls.tsx`：员工详情字段输入和分区壳组件。
- `ui/profile/lunar-birthday.ts`：员工出生日期转农历生日 helper。
- `ui/tabs/DepartmentPositionTab.tsx`：部门岗位架构与说明书维护页面。
- `server/autocomplete.ts` 和 `server/autocomplete-config.ts`：HR FK/autocomplete 查询与搜索字段配置。
- `server/crud.ts`：HR 字段级 CRUD wrapper，统一注入 HR 权限检查并复用 Platform CRUD 契约。
- 公司事实查询、编码解析和缓存由共享的 `@workspace/platform/server/company-directory` 提供；公司及股权关系维护归资本证券，HR 只消费公司候选。
- `server/contracts.ts`：合同迁移期只读清单；旧创建、整表覆盖和物理删除入口均为 410 tombstone。
- `server/employment-agreements.ts`：稳定协议身份、有效期限和不可变条款修订的唯一在线写入 seam，所有命令要求 optimistic `expectedVersion`。
- `server/employment-agreement-legacy.ts`：`Employment.contracts` JSON 的只读 fingerprint 双读与迁移 preflight；重复或缺关键日期的数据只报告，不猜 stable identity。
- `server/departments.ts`：部门列表、创建、更新、删除和部门说明书保存。
- `server/edps.ts`：EDP 只读列表；期间结构写入统一进入员工生命周期 service。
- `server/employees.ts`：员工列表、创建账号、字段更新和员工搜索；员工身份不提供在线 hard delete。
- `server/employments.ts`：雇佣列表与非期间资料修正；创建、删除和期间边界修改进入员工生命周期 service。
- `server/employee-profile.ts`：员工详情聚合 DTO。
- `server/employee-contracts.ts`：旧员工详情 whole-array 保存 tombstone；新入口是 `/employee-profiles/:id/agreements`。
- `server/employee-lifecycle.ts`：入职、调岗、兼岗、汇报关系变化和离职的唯一结构写入 seam。
- `scripts/check/hr-business-temporal-preflight.ts`：上线前在同一只读快照内扫描 Employment / EDP / EmployeeProject 期间与当前态一致性；开放结束必须为 `null`，通过 `npm run hr:temporal:preflight -- --as-of YYYY-MM-DD` 执行。
- `scripts/repair/repair-hr-lifecycle-compatibility.mjs`：受 `hr-lifecycle-compatibility-v1` 私有数据发布 handler 调用，按精确版本和历史证据修复可确定的旧 Employment / EDP 期间矛盾，并写入审计快照；不接受任意 SQL 或模糊匹配。
- `server/employee-history.ts`：员工详情历史记录聚合。
- `server/field-validation.ts`：HR 字段日期、选项、身份证、公司名、岗位投入权重与折算占比派生。
- `server/position-description-template-store.ts`：岗位说明书视图模板读写。
- `server/position-descriptions.ts`：岗位说明书树、列表、详情和保存。
- `server/positions.ts`：岗位列表、创建、更新和删除。
- `server/roster.ts`：HR 名册列表、导出和筛选选项。
- `server/search.ts`：HR 员工和主数据搜索语义。
- `server/domain/*-validation.ts`：HR roster 写服务的 domain command/validator。当前覆盖员工、雇佣非期间修正、雇佣协议 lifecycle、人员生命周期、部门、岗位和岗位说明书，统一收口 FK、日期、枚举、百分比、汇报岗位、合同公司、跨字段/跨行规则和归档/删除引用保护。对应 service 只消费这些 validator 后执行写库和审计，不能重新散落业务规则。

雇佣协议采用 `EmploymentAgreement` anchor + `EmploymentAgreementTerm` 含首尾日有效期间 + append-only `EmploymentAgreementRevision`。create / renew / end / correct / revise / publish / supersede / set-primary / cancel-future 全部经过同一命令 module；条款发布会新增 revision 并移动 anchor 当前指针，旧 revision 永不覆盖。`Employment.contracts` 仅保留为迁移来源；在线路径不得按数组下标更新或删除，也不得把整组前端 rows 覆盖回 JSON。

旧的 `app/hr/*` 类型和 helper 文件保留为 re-export，避免一次性改动大量页面引用。
旧的 HR UI 大组件和第一批字段组件路径保留为 re-export，Next route 和现有页面入口保持不变。
旧的 HR API route 保留为认证、权限和 HTTP 响应薄壳，业务查询和校验从 `@workspace/hr/server` 引入。
`@workspace/hr/server` 根入口只显式导出当前 route/page 需要的 schema、command 和查询接口，不再通过 wildcard 暴露全部实现。包内实现或明确的内部消费者使用已有 `@workspace/hr/server/*` 深路径；新增 root 导出必须有真实跨模块调用方。
项目相关能力已从 HR 剥离到 `@workspace/work`，HR 不再维护 Project / EmployeeProject 入口。
