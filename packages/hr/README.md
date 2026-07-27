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
- `server/contracts.ts`：基于正式 `EmploymentAgreement` 的合同只读清单与数据库分页；旧创建、整表覆盖和物理删除入口均为 410 tombstone。历史 JSON 只能用于 baseline 发布核对，不得成为正常列表事实源。
- `server/employment-agreements.ts`：稳定协议身份、有效期限和不可变条款修订的唯一在线写入 seam，所有命令要求 optimistic `expectedVersion`。
- `server/employment-agreement-legacy.ts`：`Employment.contracts` JSON 的稳定 fingerprint 解析与标准合同 DTO 投影，仅用于受控 baseline 数据发布和迁移核对，不作为正常在线合同的数据源。
- `server/departments.ts`：部门列表、创建、更新、删除和部门说明书保存。
- `server/edps.ts`：EDP 只读列表；期间结构写入统一进入员工生命周期 service。
- `server/employees.ts`：员工列表、创建账号、字段更新和员工搜索；员工身份不提供在线 hard delete。
- `server/employments.ts`：雇佣列表与非期间资料修正；创建、删除和期间边界修改进入员工生命周期 service。
- `server/employee-profile.ts`：员工详情聚合 DTO。
- `server/employee-contracts.ts`：旧员工详情 whole-array 保存 tombstone；新入口是 `/employee-profiles/:id/agreements`。
- `server/employee-lifecycle.ts`：入职、调岗、兼岗、汇报关系变化和离职的唯一结构写入 seam。
- `server/employee-period-revisions.ts`：Employment / EDP 历史周期修订 seam；按 Business Temporal policy 校验追溯、重叠和修订能力，要求 reason 与 expected revision，并记录永久前后值台账。
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

雇佣协议采用 `EmploymentAgreement` anchor + `EmploymentAgreementTerm` 含首尾日合同期间 + append-only `EmploymentAgreementRevision`。提前续签允许与上一段期限重叠，合同期限也允许按历史日期补录；数据库和 service 不得把重叠或早于当前业务日当成无效历史。员工详情按“合同资料、当前合同期限、待生效合同期限、历史合同期限”展示；历史 baseline 与新建合同使用同一标准合同界面，UI 不得出现 `legacy`、`baseline`、迁移前、只读投影、`vnull`、状态未知或内部来源说明。新建合同时，UI 按合同开始日期自动匹配唯一一条 Employment，不向用户暴露技术性的“雇佣记录”外键；未命中或命中多条时必须先修订雇佣周期，服务端也校验合同开始日期属于该 Employment。新建合同、续签、终止、期限修订、合同资料修订、设主合同和取消待生效期限全部经过同一命令 module；合同资料保存会直接新增 superseding revision 并移动 anchor 当前指针，旧 revision 永不覆盖，UI 不暴露草稿、发布、替代等技术动作。

同一签约公司可以有多份独立法律协议，不能以公司名合并 anchor。员工详情先选择签约主体，再在该主体的协议表中按类型、签署日期、到期日期、结束日期、状态和附件数区分协议；点击行后只展开当前协议，不暴露内部 `version`。Term 的 `effectiveThrough` 是约定到期日期；anchor 的 `actualEndDate` 是真实结束日期，只由明确终止事实写入。登记终止只更新 `actualEndDate`，不得覆盖 Term 的原约定到期日期，两者不得互相派生或混用。

社会保险使用独立 `EmployeeSocialInsurancePeriod`，并登记为 `HR_SOCIAL_INSURANCE_TEMPORAL`。`insured / stopped / uninsured / retired` 是显式业务状态，不从日期空值推导；新登记的公司、参保月份、停保月份与原因按状态条件必填，UI 星号与 domain contract 同源，月份统一使用 Core 月份选择器。历史 baseline 的已知状态必须进入正式表，公司或月份缺失时保留空值并写 `missingFieldsJson`，普通查询仍返回，不能因字段不完整丢失记录。记录页使用 Platform 标准 lifecycle record table + selected detail seam；补充模式由通用 mutation 配置校验，只开放仍在 `missingFieldsJson` 中的字段，保存追加 `EmployeeSocialInsurancePeriodRevision` 并保留 before/after/reason。

历史合同 baseline 是上线前的受控数据发布，不是用户首次保存时才触发的惰性迁移。凡是能建立稳定身份且不违反硬性业务规则的历史合同，都必须预先写入正式 `EmploymentAgreement / EmploymentAgreementTerm / EmploymentAgreementRevision` 表。缺失值按 `HR_EMPLOYMENT_AGREEMENT_TEMPORAL.baseline` 处理：没有明确无效/取消标记时按有效事实保留；缺少开始日期按开放下界保留，缺少到期日期按开放上界保留；其他缺失属性保持 `null`。实际缺失字段写入 `EmploymentAgreement.missingFieldsJson` 并按真实字段名提示；只有 `baseline.requiredFields` 声明的必填字段缺失才形成 `baseline-incomplete` 并阻断依赖动作，非必填字段缺失不影响续签、终止或普通保存。`employment-agreement-field-contract` 是请求 schema、domain validator 与 UI `required` 的共同规则源，所有可见字段严格满足 `star === required`。普通查询继续包含该合同。无法稳定识别、归属/FK 冲突、重复身份、JSON 无法解析或期限倒置等真正违反硬规则的数据才进入异常清单，不得静默丢失或伪装成新合同。原 `Employment.contracts` 永久保留为来源证据，正式记录保留 `sourceKind / sourceRef` 用于审计和幂等，不在业务界面展示。在线读取和保存只操作正式合同表；保存仍按正常合同的版本与不可变修订规则执行，不承担 baseline 建档。在线路径不得按数组下标更新或删除，也不得把整组前端 rows 覆盖回 JSON。

Employment、EDP 与雇佣协议均显式登记 `overlaps + retrospectiveChanges + revision`。默认允许补录历史日期；Employment 禁止重叠，EDP 按业务槽位/占比/唯一主岗约束，雇佣协议允许重叠。周期修订入口登记为 ActionContract：当前配置为直接执行，未来启用审批前必须补同一 payload 的 workflow adapter；若 contract 改为流程执行，现有 direct service 会失败关闭而不会绕过审批。

旧的 `app/hr/*` 类型和 helper 文件保留为 re-export，避免一次性改动大量页面引用。
旧的 HR UI 大组件和第一批字段组件路径保留为 re-export，Next route 和现有页面入口保持不变。
旧的 HR API route 保留为认证、权限和 HTTP 响应薄壳，业务查询和校验从 `@workspace/hr/server` 引入。
`@workspace/hr/server` 根入口只显式导出当前 route/page 需要的 schema、command 和查询接口，不再通过 wildcard 暴露全部实现。包内实现或明确的内部消费者使用已有 `@workspace/hr/server/*` 深路径；新增 root 导出必须有真实跨模块调用方。
项目相关能力已从 HR 剥离到 `@workspace/work`，HR 不再维护 Project / EmployeeProject 入口。
