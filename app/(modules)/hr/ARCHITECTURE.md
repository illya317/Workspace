# HR 模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 人事管理主页 | `/hr` | `app/(modules)/hr/page.tsx` → Platform `ModuleHome` |
| 人事基础资料 | `/hr/roster` | `app/(modules)/hr/roster/page.tsx` → `@workspace/hr/ui` 的 `HRClient` |
| 员工详情表单 | `/hr/roster/employees/[id]` | route shell + `@workspace/hr/ui` |
| 绩效管理 | `/hr/performance` | `app/(modules)/hr/performance/page.tsx` → `@workspace/hr/ui` 的 `HrPerformanceClient` |
| 我的绩效 | `/hr/performance/self` | `app/(modules)/hr/performance/self/page.tsx` → `@workspace/hr/ui` 的 `EmployeePerformanceClient` |
| 人力分析 | `/hr/analytics` | `app/(modules)/hr/analytics/page.tsx` → `@workspace/hr/ui` 的 `HRAnalyticsClient` |

绩效保留员工与 HR 两个业务入口：员工从 `/work/performance` 进入后由薄 route 重定向到 HR-owned `/hr/performance/self`，HR 汇总与终评入口为 `/hr/performance`。两个页面使用相同的 HR performance API 和表格口径；后续页面交互可以分叉，但正式记录、流程 adapter 与归档仍由 HR 领域拥有。`/hr/performance/self` 复用 `/work/performance` 的 `work.tasks` route gate，不把员工自评误变成 HR 汇总权限。

## HR 基础资料结构

`/hr/roster` 现在由 `packages/hr/ui/HRClient.tsx` 渲染，route 只做鉴权和挂载。页面采用主数据拆分入口：

- `员工资料`：默认入口，先显示员工列表，再进入 `/hr/roster/employees/[id]` 维护单个员工的多维资料。
- `组织架构`：通过 `DepartmentPositionTab` 的组织模式维护组织单元树。底层仍使用兼容 Prisma model `Department`，产品语义已收敛为“组织单元”。
- `部门岗位`：通过 `DepartmentPositionTab` 的岗位模式维护岗位与说明书。
- `员工信息表`：用于集中查看员工、雇佣、合同、部门岗位数据。员工、合同和雇佣非期间字段可先形成页面草稿，再由顶部保存一次提交当前 change set；Employment 的在职/入离职日期和全部 EDP 字段只读，结构变化进入员工详情“生命周期”。
- `花名册`：管理版、尽调版、CSV 导出和 Open API 共用同一生成口径，只纳入当前在职且在职雇佣记录中没有“顾问”职务的人员；离职人员和顾问仍保留在员工资料、分析等独立场景中，不进入花名册。

法律公司 Party 身份、`Company` 角色与 `OwnershipInterest` 的 canonical 维护入口位于 `资本证券 → 治理架构`。HR 只通过只读公司候选接口消费这些主数据，用于合同公司、任职汇报公司和统计口径，不维护直接持股、并表或控制期间。

组织单元的新建和修改统一消费服务端返回的 `ActionRuntime`：入口只打开本地表单，最终动作在 direct 模式显示“保存”，接入流程后显示“提交”。页面不得再用 `hrCanSubmit`、`canSubmitWorkflow` 或其他权限布尔值兜底推断编辑态；runtime 尚未加载或不可执行时保持只读。岗位及说明书当前是 permission-only 写入，继续显示“保存”。

组织单元层级分治理线与管理线：`Department.hierarchyKind = "G"` 使用 G1/G2/G3，`Department.hierarchyKind = "M"` 使用 M1/M2/M3。具体组织代码、名称、父子关系和展示顺序属于租户数据库与私有配置事实，不在源码文档中维护节点清单。

`/hr/roster` 的“组织架构”保留原“组织维护”子页，并增加只读“架构图”子页。架构图从 `BOD` 开始读取有效 `Department.parentId`：治理线展示至 G3，管理线展示全部 M1，仅 `FUN` 职能平台继续展示直属 M2，四个业务事业部的 M2 与全部 M3 不进入架构图；底层组织事实仍完整保留，不维护第二份图数据。若调用方提供明确顺序，则作为 `layoutOrder` 偏好传给 Core；未配置顺序时由 Core 保持稳定排列，并把较重分支优先放到视觉中心。hierarchy/adaptive 布局按深度独立计算每一层的宽度与居中位置，下层数量不得反向撑开委员会等上层节点；节点横竖只由本层密度决定，一层达到密集阈值时，该层所有可竖排节点统一切换为相同宽高的竖向节点。直属子节点块会在不碰撞时移到父节点正下方：单子节点直连，确有多个直属子节点时才使用该父节点自己的局部母线。HR 只提供组织事实和业务顺序，不固化坐标或间距。

组织负责人分两层：`Department.managerPositionId`（FK 到 `Position`）是唯一可编辑事实源；“组织负责人”是该负责人岗位下当前在职员工的派生名单，允许多人。组织架构、部门岗位、模板空间权限等场景只能读取这条链；`Department.managerUserId`、部门说明书 JSON 和岗位说明书汇报字段不得再承载或编辑负责人。组织架构页的岗位层级展示使用当前组织的负责人岗位：负责人岗位作为本组织顶层，其他直属岗位归到负责人岗位下；没有负责人岗位时只提示未设置，不回退岗位说明书。

`Department`、`Position` 与 `PositionReportOverride` 现在只保留稳定 identity 和当前业务日缓存；名称、代码、组织归属、父级、负责人岗位、默认汇报岗位及特殊汇报属性的权威事实分别位于 `DepartmentEffectiveVersion`、`PositionEffectiveVersion`、`PositionReportOverrideEffectiveVersion`。版本行和 `OrganizationStructureChange` 命令台账只追加不更新/删除，所有在线变化必须提交生效日、幂等键和 expected sequence；纠错、终止与未来取消还必须提交原因。正常变化会在同一 Serializable 事务中替代原切片、保留旧切片并刷新当前缓存，数据库延期约束在提交时拒绝仍有效叶子版本重叠。列表 DTO 固定返回服务端 `asOfDate` 以及 current/upcoming/history，UI 不再把待生效变化放进历史，也不以 `isArchived` / `isActive` 作为第二事实源。

人事说明书是次级资料库，不承载主数据身份事实。岗位说明书的 `Position.code`、`Position.name`、`Position.departmentId -> Department.name` 是岗位编码、岗位名称、所属组织的唯一事实源；部门说明书的 `Department.code`、`Department.name` 是组织编码、组织名称的唯一事实源。说明书页面可以展示这些字段，但不得写入 `PositionDescription` / `DepartmentDescription`。说明书只保存岗位目的、摘要、编制、版本、生效日期、来源文件、原始编码、正文 JSON 等文档事实；岗位说明书的汇报对象使用 `PositionDescription.reportToPositionId -> Position.id`，不得再用字符串岗位名承载关系。

部门说明书正文中的旧 `基本信息.负责人/主管领导/岗位编制/定编岗位` 已通过数据迁移删除；运行时代码不再读取或清洗这些兼容字段。负责人只从 `Department.managerPositionId` 派生，编制只从当前岗位主数据统计。

岗位职责条目从 `PositionDescription.details.duties` 同步到 `PositionResponsibilityNode`。该表只索引职责大类和小类，保存稳定 `nodeKey`、说明书版本、更新时间、JSON 路径和文本 hash；岗位说明书 JSON 仍是正文来源。Work/OKR 引用职责时不得靠 JSON 下标，必须引用职责节点并保存当时的职责文本快照。

FUN 职能岗位不复制到应用部门。`Position.departmentId` 继续表示岗位主数据归属，所有职能岗位统一归属 FUN 线；特殊应用和跨公司汇报通过 `PositionReportOverride(positionId, companyId, departmentId)` 维护，唯一键是岗位、汇报公司、应用部门。维护入口语义为岗位详情里的“特殊汇报”，组织架构页不承载写入。生命周期命令创建普通员工任职期间时先确定 `EDP.reportingCompanyId`（默认从员工当前/主合同公司解析，并支持租户公司 aliases），再选实际部门和岗位；`reportingCompanyId`、`departmentId`、`positionId`、`allocationWeight` 都是新任职的必填事实。`allocationWeight` 是大于 0 的相对投入权重，不要求合计为 100；查询业务日的折算占比由当日全部有效任职权重归一化派生，不入库。`Employment.title` 为“顾问”或“董事”时允许合法没有 EDP，不要求岗位、组织归属或投入权重。候选岗位 = 本部门岗位 + 对该公司和部门启用的 FUN 特殊汇报岗位。选择 FUN 岗位后 `EDP.departmentId` 写实际部门，`EDP.positionReportOverrideId` 指向命中的特殊汇报规则。员工直接上级优先取 `PositionReportOverride.reportToPositionId`；没有命中特殊汇报时，普通岗位取实际组织的负责人岗位，负责人岗位取上级组织的负责人岗位，不回退 `PositionDescription.reportToPositionId`。

服务器旧库处理顺序：
1. 上线前备份数据库，并导出 `PositionDescription` 的旧 `code/name/departmentName/reportTo` 和 `DepartmentDescription` 的旧 `code/name` 作为审计 CSV。
2. 先跑 preflight：检查 `Position.code` 重复、`Position.positionDescriptionId` 多岗位共享、未被岗位引用的孤儿说明书、`reportTo` 无法按岗位编码/名称匹配或匹配多岗位的记录。
3. 旧 `PositionDescription.code/name/departmentName` 与岗位事实冲突时，一律以 `Position` 和 `Department` 为准；旧 `DepartmentDescription.code/name` 与组织事实冲突时，一律以 `Department` 为准；迁移会删除这些说明书列，不做反向覆盖。
4. `reportTo` 可唯一匹配岗位编码或岗位名时回填到 `reportToPositionId`；无法匹配或多匹配的记录上线前人工指定，无法确认则置空，不保留字符串关系。
5. 迁移后复查：说明书不再有身份列，`Position.positionDescriptionId` 唯一，说明书保存请求不接受主数据身份字段，预览与列表均从 FK 主数据派生展示身份信息。

员工详情页只维护员工相关维度：基本信息、雇佣关系、社会保险、任职管理、历史记录。部门岗位记录与人员生命周期办理统一归入“任职管理”TAB，不保留两个平级入口；部门、岗位作为主数据独立维护，详情页只通过 FK 搜索选择。原 Project / EmployeeProject 已剥离到 Work，HR 不再维护项目入口。

### 生效日期与人员生命周期

`Employment` 是雇佣期间事实，`EDP` 是员工任职期间事实，两个期间均使用包含首尾日的日期区间。入职日 D 从 D 当天生效；调岗、汇报关系变化和兼岗在 D 创建新任职片段，原任职片段自动截止到 D-1；离职事件的生效日 D 表示从 D 起不再在职，因此雇佣、任职和当前项目成员期间截止到 D-1。当前态统一按租户业务时区和期间字段即时派生，只有完全没有入离职日期的旧雇佣记录才回退 `Employment.isActive`，不得依赖定时任务把未来记录翻成当前。

HR 数据质量 Provider 继续把雇佣、当前任职、组织归属和投入权重完整性作为内部巡检与迁移 preflight；这些都是系统不变量，不注册为个人通知或可订阅事件。新任职必须有汇报公司、部门、岗位和大于 0 的投入权重；除离职外的生命周期变更在生效日必须仍有当前任职，且当前任职必须且只能有一个主岗。主岗与权重相互独立，不要求主岗权重最大。生命周期事务提交成功后仍可按 Employee 触发重评，用于发现存量导入和非标准写入遗留问题，但不得向用户发送“订阅提醒”。

员工详情“任职管理”页签内的生命周期办理区是人员结构变化的唯一在线入口，通过 `PUT /api/modules/hr/roster/employee-profiles/[id]/lifecycle` 登记入职、调岗、兼岗、投入调整、主岗变更、汇报关系变化和离职。变更类型必须按所选生效日的事实过滤：已有未结束雇佣或未来雇佣时不显示也不接受“入职”；只有从未入职、上一段雇佣已经结束后的重新入职，或系统唯一的旧空占位记录补登记时才允许。没有有效雇佣期间时不得选择调岗、兼岗、投入调整、主岗变更、汇报关系变化或离职；UI 候选与 domain validator 必须调用同一 HR lifecycle contract，不能只隐藏选项。变更类型属于数量很少且不可遗漏的固定业务枚举，下拉层必须一次完整显示当前全部可用动作，不使用滚动或较小 `visibleCount` 隐藏剩余项。兼岗只新增自己的任职期间和投入权重，不扣减或恢复其他岗位；投入调整只拆分被调整的任职；主岗变更在同一事务内截止原主岗和目标岗位旧版本并创建新版本，权重保持不变。route 只校验请求形状并调用 HR service；domain validator 校验生效日期、来源任职、目标岗位、汇报岗位和所有未来期间边界上的正数投入权重/唯一主岗，service 在同一事务内拆分 `Employment` / `EDP` 期间并写入不可变 `EmployeeLifecycleEvent` 台账。是否允许历史补录、是否允许重叠及如何修订统一读取 `HR_EMPLOYMENT_TEMPORAL` / `HR_ASSIGNMENT_TEMPORAL`：两者默认允许补录；Employment 禁止重叠，EDP 按槽位、唯一主岗和正数投入权重校验。离职继续受入职日期、有效雇佣期间和离职原因约束，并在投影后取消合法未来记录、将当前记录和非法但仍开放的旧记录截止到 D-1。普通 Employment 页面只修正办公地点、人员类型、职级、职务、离职原因与备注；`isActive/joinDate/leaveDate` 不走普通保存。既有 Employment / EDP 周期修订通过 `POST .../period-revisions` 提交 reason 与 expected revision，服务端重验完整时间线，并把前后值永久记录在 `EmployeePeriodRevision`；任何在线修订入口都必须附着在所属雇佣或任职记录行内，员工“历史记录”页签只读展示审计事实，不承载编辑器。

员工身份当前没有 draft / archived 状态，新建时会立即创建可登录 Workspace 账号，因此不存在可安全 hard delete 的“未启用草稿”。在线员工删除 route 与 action 已移除：离职走生命周期，账号禁用走独立账号管理，不能用删除员工替代任一动作。Employee、Employment、EDP 以及生命周期会联动的 EmployeeProject 审计记录仍可查看，但不能从通用审计界面恢复重建。

汇报关系是岗位关系，不是固定人员关系。`Position.reportToPositionId` 和 `PositionReportOverride.reportToPositionId` 是结构默认值；`EDP.reportToPositionId -> Position.id` 是某段任职期间实际采用的汇报岗位快照。人员只在使用时按业务日期从该岗位的有效 `EDP` 占有人派生，因此汇报岗位换人后无需逐个改下属，历史期间也不会被当前组织结构重写。`EDP.reportTo` 仅保留为旧库兼容列，新写入不再使用。Platform 的 `currentEmploymentDateWhere`、`currentOpenEndedDateWhere` 是 HR、权限、审批和 Work 读取当前人员/任职的共享口径，未来任职不得提前获得权限，已到离职生效日的人员不得继续作为处理人或负责人。

新建员工档案默认同步创建一个 Workspace 账号：账号昵称使用员工姓名，用户名使用姓名拼音生成；同名或重名时追加员工编号/序号保持唯一。员工编号分配必须同时避开 `Employee.employeeId` 和历史 `User.employeeId`，管理员手工绑定账号工号时也必须拒绝绑定到已被其他账号或员工档案占用的工号，保证一个员工编号最多只有一个 Workspace 账号。

虚拟员工复用同一条 `Employee -> Employment -> User -> EDP` 主数据链，不建立 Agent 私有员工表。其 `Employment.personnelType = 虚拟员工`，关联 Workspace 账号固定 `canLogin = false`；不同虚拟员工可以分别配置部门、岗位以及用户/岗位/部门 RBAC。虚拟身份的创建及 `personnelType` 生命周期只能由 Agent provisioning 管理，普通 HR 员工创建、任职创建和任职编辑不得进入或退出该类型；岗位及其他人事资料仍由 HR 维护。`/agent` 只拥有可执行配置与运行记录，系统管理的智能体页只管理全局 action 上限。多个虚拟员工共用 Platform Agent 运行时；请求人拥有会话、提案和确认责任，选中的虚拟员工作为业务执行与审计 actor，权限始终取请求人、虚拟员工、全局上限和配置工具白名单的交集。生成花名册排除虚拟员工，普通员工目录和 Work 分配候选仍保留这些身份。

员工详情页的用工协议、社会保险与部门岗位使用专用卡片布局：

- 协议：用工主体由 Employment / 用工关系确定，劳动或劳务、保密、竞业限制及补充协议作为独立 `EmploymentAgreement` anchor 管理。展示采用“签约主体 → 主体下协议表”的主从结构：主体层只列公司和协议数量，协议表列类型、开始日期、到期日期、结束日期、状态和附件数；当前 schema 没有独立签署日期，不得把期限开始日标成签署日期。协议 registration 必须声明标准 `recordView` 并直接使用 Platform `createBusinessTemporalRecordSections`；页面初始不选协议，点击行后只在该行下展开资料、协议级动作、附件及“期限与版本记录”表格，再次点击收起，禁止恢复卡片堆叠或表外详情。新增协议必须声明为“签约主体”section header 的标准 `CreateSurface block`，展开区位于标题与原内容之间，不能手工追加到协议表后，新建时默认带入当前主体且允许重新选择公司。历史 baseline 与新建协议必须使用同一套正常界面；页面不得出现 `legacy`、`baseline`、迁移前、只读投影、`vnull`、状态未知或内部来源说明。业务期次与期限性质是独立事实：新建生成第 1 期、续签自动生成下一期，固定期限/无固定期限单独选择，不能用期次推断期限性质；固定期限缺少到期日只显示“待补充”，不得推断成“长期”。`HR_EMPLOYMENT_AGREEMENT_TEMPORAL` 明确允许历史补录和期限重叠，因此提前续签不得自动错开或拒绝。协议资料使用单一界面：`missingFieldsJson` 中的字段原位可填写，其他字段原位只读，不复制补充表单，也不为补充增加第二个 edit；补资料/纠错时不同时显示期限保存，展开行只由根 FormSurface 持有动作。资料保存仍执行 `supplement-missing` / `correct-existing` patch 并追加 superseding revision。“续签”和“更换协议”作为协议级动作直接进入对应表单，不显示首签/续签、期限命令或历史期限选择器；期限表点击哪一行就以该行 `termUid` 为目标，系统根据缺失字段和实际改动自动派生 `supplement-term` 或 `correct`，当前期限行才可登记终止，待生效期限行才可取消。期限纠错只校验目标、版本、原因和修正值自身一致性，不进入续签重叠、当前态或期数验证，并按 `supersedesId` root 保持原业务期数。现实协议或主体变化必须使用“更换协议”按新建完整 payload 创建新 anchor，不能通过纠错重写旧协议。新建/更换协议按开始日期自动归属唯一一条 Employment，不显示技术性的“雇佣记录”选择器；归属缺失或歧义时失败关闭。
- 同一用工主体可以存在多份独立法律协议，不能按公司名合并 `EmploymentAgreement` anchor，也不再使用 `isPrimary` / “主合同”区分。选择器和协议卡片按用工主体、协议类型与期限区分，不显示内部 `version`。Term 的 `effectiveThrough` 表示约定到期日期；anchor 的 `actualEndDate` 只表示明确登记的真实结束日期。登记终止只更新 `actualEndDate`，不得覆盖 Term 原约定到期日期，也禁止把约定到期日投影成事实结束日期。
- 每个 `EmploymentAgreement` 可以有多份附件。原件不可变保存；PDF 通过 Platform PDF optimization seam 生成校验后的压缩派生件，默认下载更小且校验通过的压缩版，同时始终保留原件下载。附件移除只做软删除并保留操作人、时间和原因，压缩失败不得影响原件归档。
- 社会保险与协议完全解耦，由 `EmployeeSocialInsurancePeriod` 显式保存 `insured / stopped / uninsured / retired` 状态、可空参保公司、包含首尾月的 `YYYY-MM` 时间线及 `missingFieldsJson`。只有现行 `insured` 受同一员工唯一约束；参保转移在同一事务中把原记录转为 `stopped`、截止到新参保月份的上一个月并建立新记录。在线登记按状态条件必填：已参保要求公司和参保月份，已停保要求停保月份和原因，未参保不要求公司或月份，已退休的月份可选；UI 的星号与 domain contract 必须同源。月份必须走 Core `temporal + precision=month` 系统控件。历史已知状态必须预写正式表；公司或月份缺失时保留 `null` 并登记具体缺失字段，不能丢弃或靠空日期改判状态。UI 上方只做当前状态摘要，下方通过 Platform `createBusinessTemporalRecordSections` 标准 lifecycle record contract 展示全部正式记录（包括当前摘要来源行）并标记当前；点击记录后，已知字段只读，只有通用 mutation 配置中仍属于 `missingFields` 的字段可补充，保存追加 `EmployeeSocialInsurancePeriodRevision` 并逐项清除质量标记。未登记为缺失的可选空值显示“—”而非“待补充”。退休状态不能被用来伪造来源中不存在的参保公司和参保期间。`sourceKind / sourceRef / baseline key` 只用于审计，禁止投影进业务备注。模型仍保持固定单线，不拆险种，也不建立复杂参保计算 helper。
- 历史合同 baseline 必须在上线前通过受控数据发布预先写入正式 `EmploymentAgreement / EmploymentAgreementTerm / EmploymentAgreementRevision` 表，不能推迟到用户首次保存。只要记录能建立稳定身份且不违反硬性业务规则，即使非关键字段缺失也必须入库。缺失语义由 `HR_EMPLOYMENT_AGREEMENT_TEMPORAL.baseline` 统一约束：没有明确无效/取消标记时按有效事实保留；缺少开始日期按开放下界保留，缺少到期日期按开放上界保留；其他缺失属性保持 `null`。实际缺失字段写入 anchor 的 `missingFieldsJson` 并在页面按真实字段名提示；只有 `baseline.requiredFields` 声明的必填字段缺失才形成 `baseline-incomplete` 并阻断依赖该字段的动作，非必填字段缺失不得限制续签、终止或普通保存。所有 baseline 聚合统一执行 Business Temporal 三分法及展示 contract：缺失字段补充、既有事实纠错、现实业务变化分别进入 patch-only、audited correction 与 new lifecycle fact；缺失字段原位可填、已有字段原位只读、纠错显式进入独立模式，禁止同一命令或同一界面混合。字段必填性由 `employment-agreement-field-contract` 同时驱动请求 schema、domain validator 和 UI `required`，严格满足 `star === required`，不得在 UI、导入和 service 另写一份必填规则。普通查询始终包含该合同。只有无法稳定识别、归属/FK 冲突、重复身份、JSON 无法解析或期限倒置等硬冲突才进入异常清单。原 `Employment.contracts` 始终保留为来源证据，正式记录的 `sourceKind / sourceRef` 只用于审计与幂等，不得暴露在业务界面。在线读取与保存只面向正式合同表；保存按正常合同的版本和不可变修订规则执行，不承担 baseline 建档。
- 雇佣关系：上方投影当前/最近雇佣摘要，下方通过 `HR_EMPLOYMENT_TEMPORAL.ui.recordView` 与 Platform `createBusinessTemporalRecordSections` 展示全部雇佣周期。记录默认全部收起，点击某行后仅在该行下展开资料，再次点击收起；入离职日期等期间字段只读，办公地点、人员类型、职级、职务、离职原因和备注通过通用 `edit-existing + page-save` 配置修正，并在同页维护合同。禁止另写 HR 专属历史卡片、表外编辑区或默认展开当前记录。
- 任职管理：同一 TAB 先只读展示员工-部门-岗位的当前、待生效、历史与异常期间，再登记历史、当天或未来生效的入职、调岗、兼岗、投入调整、主岗变更、汇报关系变化和离职，最后展示只包含日期/结构操作的事件台账。部门岗位和生命周期不得重新拆成两个平级员工详情入口。
- 历史记录：只读聚合 `EditHistory` 与 `EmployeePeriodRevision`，展示编辑人、编辑时间、实体、版本、修订原因和字段级前后值；编辑入口必须留在所属业务记录行内。

发布任何 Employment / EDP 生命周期迁移前必须执行 `npm run hr:temporal:preflight -- --as-of YYYY-MM-DD`。preflight 在同一 `REPEATABLE READ READ ONLY` 快照内报告 Employment、EDP 和 EmployeeProject 的非法/倒置期间与高日期哨兵，检查 Employment 重叠与 stale flag、EDP 同槽位重叠、投入权重、当前雇佣/任职一致性，以及当前项目成员是否存在当前 Employment；包含式开放结束必须为 `null`。发现问题必须先走受控数据发布批次，不能临时恢复普通 EDP CRUD。新增 migration 合入本地开发分支后必须重启 `npm run dev`，或显式执行 `scripts/runtime/run-with-repo-node.sh npx --no-install prisma migrate deploy --schema=./prisma`，不能只生成 Prisma Client 而让 dev 数据库继续停留在旧 migration 状态。

`员工信息表` 下每个 Tab 是一个独立的 `*Tab.tsx` 组件：

| Tab | 组件 | 说明 |
|-----|------|------|
| 员工信息 | GenericTableTab + employeeConfig | 批量维护员工主数据 |
| 雇佣记录 | GenericTableTab + employmentConfig | 批量查看期间并修正非期间资料 |
| 员工岗位 | GenericTableTab + edpConfig | 只读查看员工-部门-岗位期间 |
| 合同信息 | GenericTableTab + contractConfig | 只读迁移清单；写入进入员工详情协议 lifecycle |
| 项目 | - | 已剥离到 `@workspace/work`，HR 不再维护入口 |

可编辑 Tab 共用 Core `usePageDraft` 与 Toolbar `edit-group` 的页面编辑协议；员工和 Employment 非期间资料使用 `{ changes: [{ id, field, value }] }`。合同 Tab 与 EDP Tab 不形成页面草稿；协议写入和人员结构变化分别由专用 lifecycle command 负责。

## 核心组件链

```
roster/page.tsx
  └─ @workspace/hr/ui HRClient
       ├─ EmployeeDirectory (packages/hr/ui/profile/EmployeeDirectory.tsx)
       ├─ DepartmentPositionTab (packages/hr/ui/tabs/DepartmentPositionTab.tsx)
       └─ GenericTableTab (packages/hr/ui/tabs/GenericTableTab.tsx + packages/hr/ui/hooks/useGenericTab.ts)
            ├─ EditableTable (packages/hr/ui/tabs/EditableTable.tsx) — 表格渲染+编辑
       │    ├─ FilterModal (FilterModal.tsx)            — 筛选弹窗
       │    ├─ createGenericEditInputSpec               — 表格编辑字段规格
       │    └─ EntitySearchInput / FilterSearchInput    — 搜索输入
```

## 数据流

1. **tabConfigs.ts** 定义每个 Tab 的字段配置（FieldConfig[]）、FK 映射、API 端点
2. **packages/hr/ui/hooks/useGenericTab.ts** 提供 HR 批量表加载、页面草稿、统一保存、搜索、筛选和审计日志 hook
3. **GenericTableTab.tsx** 消费 hook，渲染表格 + 工具栏 + 弹窗
4. **API 路由** 在 `app/api/modules/hr/roster/` 下；`employees/employments` 的 base `PUT` 接收统一 change-set envelope；`contracts` 与 `edps` base route 只保留 GET；协议命令集中到 `POST employee-profiles/:id/agreements`

HR owner 当前登记 21 个版本化 source：员工、雇佣、部门岗位关系、合同、部门、岗位、公司，部门/岗位说明与负责人，审计条目/变更和岗位汇报覆盖，以及绩效考勤、工作计划、贡献、正式评审、评审详情、归档证据字段、周期与汇报状态。每个 source 都继承对应受保护 GET 的原 `resourceKey + requiredActions` 和对象可见性；经营分析空间权限不会替代 HR 数据权限，`sensitivity` 也不会成为字段二次授权。公开 DTO 中的稳定标量，包括内部 ID、业务编号、版本、时间和离职等敏感业务字段，均可登记查询；嵌套公开结构拆为 child source，凭证、二进制内容和纯流程动作运行态不进入分析源。

`GET /api/modules/hr/roster/employments` 继续保留旧接口“匹配任一历史/当前部门岗位关系”的口径，避免静默改写现有 v2 模板；只有 `hr.employments@1` 的部门 scope 使用 HR 私有 current-department service，按查询当日有效关系强制绑定目标 `departmentId`。其个人/项目 scope 以及没有可信空间外键的花名册主数据都明确为当前账号可见的全公司数据。绩效源的个人 scope 复用 dashboard self 视图，部门/项目 scope 强制绑定 summary 目标；周期维度是 viewer scope。`hr.performance-review-details@1` 和 `hr.performance-review-evidence-values@1` 不能接受任意 reviewId：owner 必须先调用同一 dashboard 得到当前 self/summary 目标内的可见 review ID，最多 5,000 个，再通过一次 `id IN (...)` 有界批量读取；返回结果还会按可见 ID 集合二次过滤。详情源覆盖三类归档评语和创建/更新时间，证据源把公开 `workEvidenceSnapshot` 全量展开为确定性 JSON 路径和值行；两者的敏感级与导出策略只描述数据治理，不形成读取二次授权，流程 submission 和 `ActionRuntime` 仍属于控制面。模板不能提供或覆盖可信 scope 条件，现有 v2 页面仍未切换到这条执行链。

`POST /api/modules/hr/internal/workspace-analysis-sources` 是仅允许 Finance unit 调用的 HMAC internal contract，支持严格的 `catalog` 与 `execute` 两种 operation。两者都会确认 requester 仍存在；catalog 由 HR owner 执行登记的 `hr.roster.read` 判定，只返回当前目标可用且重新通过 canonical/owner 校验的 source definition。execute 还会按精确 `sourceKey + version` 再次授权，强制路径目标部门，使用 HR 私有 adapter 分页，并只返回调用方请求的 canonical rows、pageCount 和 byteCount。请求/响应都不暴露 adapter URL、响应路径、字段原始映射或分页机制；Finance 不得直接 import HR registration/service，也不得把“经营分析空间可读”替代为 HR 数据权限。

默认无搜索/高级筛选的 HR 列表读取必须在 PostgreSQL 先完成计数和分页，再只加载当前页的关系数据；合同清单以 `EmploymentAgreement` 为在线事实源完成数据库分页，不得继续展开 `Employment.contracts` 充当正常列表，也不得先 `findMany` 全量员工、雇佣或员工岗位后在 Node 内存分页。需要组织路径的复杂筛选可以走明确的慢路径，但不能污染打开 Tab 的默认路径。任何环境若尚未完成合同 baseline 发布，应由部署/preflight 阻断并输出异常清单，不能以 legacy JSON fallback 代替正式数据发布。尽调版花名册默认列固定为“姓名、部门、岗位、性别、学历、入职时间”，其他字段由列设置按需开启。

员工详情页的数据流：

1. `GET /api/modules/hr/roster/employee-profiles/[id]` 聚合读取员工、雇佣、合同、部门岗位和生命周期台账，并按业务日派生当前状态。
2. 基本信息保存复用 `PUT /api/modules/hr/roster/employees` 的批量 change set。
3. 雇佣关系保存复用 `PUT /api/modules/hr/roster/employments` 的批量 change set，但只接受非期间资料字段；结构字段由 domain validator 返回 409。
4. 部门岗位只从员工详情和 `GET /api/modules/hr/roster/edps` 读取，不提供普通 POST / PUT / DELETE 或整组保存入口。
5. 合同正常读取只查询 `EmploymentAgreement / Term / Revision`，员工合同 UI 不区分新建记录与 baseline 记录。历史 `Employment.contracts` 仅供受控数据发布、迁移核对和审计取证；baseline 发布使用稳定 fingerprint 幂等写入正式表，并输出成功、字段缺失和硬冲突清单。在线 `POST /api/modules/hr/roster/employee-profiles/[id]/agreements` 接受 typed command：新建/更换使用完整协议 payload，其他变更使用正式 `agreementUid + expectedVersion`，执行合同资料补充/修正、期限补充/修正、续签、终止、设主合同或取消待生效期限，不承担历史数据建档。
6. 人员生命周期变更走 `PUT /api/modules/hr/roster/employee-profiles/[id]/lifecycle`；既有 Employment / EDP 周期修订走 `POST /api/modules/hr/roster/employee-profiles/[id]/period-revisions`。两者都读取 Business Temporal contract；后者还经过独立 `revise` 权限和 ActionContract direct-execution gate。

## 考勤绩效工作台

`/work/performance` 是员工侧入口薄壳，只做 `work.tasks` route 鉴权并重定向；真正渲染 `packages/hr/ui/performance/EmployeePerformanceClient.tsx` 的页面是 `/hr/performance/self`。`/hr/performance` 由 `packages/hr/ui/performance/HrPerformanceClient.tsx` 渲染。绩效 API、UI 实现和正式记录保持同一 HR owner，两个 HR route shell 只做鉴权和挂载。页面分三块：

- 员工入口固定请求 `view=self`；服务端在缺省 `view` 时也必须按本人处理，强制使用当前登录账号关联的在职员工，并在员工、正式记录、流程单、工作计划和贡献材料查询进入数据库前收窄范围。客户端传入其他员工、部门或项目 audience 不能扩大该范围。
- HR 处理入口固定请求 `view=summary`。汇总读取只接受目标资源 `hr.performance` 自身的显式 `read`、系统管理员，或 `approve/reject` 处理能力；父级 `hr.read` 与 `submit/revise` 等高阶动作虽然可隐含普通 read，但不能据此读取全员汇总。正式记录详情、贡献 dossier 和流程列表沿用同一 self/summary 边界。

- `考勤`：只读展示 HR 在职口径，包括员工、公司、部门、岗位、人员类型和 `Employment.attendanceType`。V1 不新增打卡事实表。
- `贡献材料`：按二级范围列出工作空间目录。个人范围一人一行；部门范围按 Work 标准组织空间列出 M 体系部门和治理委员会，一空间一行；项目范围一已开启项目空间一行。点击后按 `(targetType, targetId, cycleId)` 读取对应空间材料：周/月展示工作汇报，季度/半年/年度展示期初目标。周/月目录复用 Platform 的 Work 汇报策略契约，展示待提交、按时提交、逾期提交、待补交、已截止、未启用或无工作空间，并同时显示截止日和最后提交时间；顶部展示应汇报总数，并分别统计按时提交、逾期提交和逾期未交，后三项互不重复，未到截止时间的待提交只在明细中展示，停用与无工作空间不计入应汇报。这里只读，不要求 `work.tasks` 权限。
- `绩效`：展示正式绩效记录和绩效流程单。新建和编辑只打开页面草稿，不创建或修改流程单；最终动作由流程单 `ActionRuntime` 唯一决定为提交、再次提交、通过或驳回，撤回和取消申请保留为显式流程状态动作。

绩效周期复用 Work 领域 `WorkOkrCycle`，HR 不维护独立周期表。正式记录写入 HR-owned `HrPerformanceReview`，唯一键为 `(employeeId, okrCycleId)`，同一员工同一周期只能存在一份已归档绩效。`okrCycleId` 是逻辑 FK，service 在创建流程和归档时校验周期存在。

绩效流程使用 Platform ApprovalRequest：

1. 员工点击“新建自评”只进入本地编辑态，最终“提交”才在内部创建 ApprovalRequest 草稿并立即提交；已有草稿、撤回单或驳回单点击“编辑”后，最终动作分别由 runtime 映射为提交或再次提交。
2. 默认第一个审批节点是 `direct_manager`，直属上级来自现有自然上级链 `listDirectManagerUserIds`，该节点可写直属上级评分和评语。
3. 默认第二个审批节点是有 `hr.performance.approve` 的 HR 处理人，该节点可写最终分、等级和 HR 评语。
4. HR 最终通过时才创建 `HrPerformanceReview`，并重新抓取所选周期的 Work/OKR 材料以及每项 KPI 最新的已确认结果快照，生成 `workEvidenceSnapshotJson`。快照使用版本化 `work + kpi` 结构；HR 只复制已确认 KPI 分数和证据，不重新运行 Work 的评分公式，归档后也不随 Work 后续修改变化。

绩效范围事实统一由 HR-private `performance-audience` 模块维护：在职员工、M 体系及治理委员会部门、已开启项目空间、部门后代和项目成员有效期使用同一口径；dashboard、贡献材料 dossier 与归档快照不得各自重建范围规则。

业务动作注册为 `hr.performance.review.evaluate`，默认流程为“员工自评 → 直属上级评分 → HR 审批归档”。该 ActionContract 只支持 `workflowDraft`；`WorkflowPolicy` 可以覆盖节点配置或关闭新的提交流程，但关闭后动作是 unavailable，不得切到 direct，已有流程单继续按创建时快照处理。正式记录只能通过 `hrPerformanceApprovalAdapter.commitApprovedPayload` 归档，不能用不完整的自评数据直写正式表。Dashboard 必须返回创建 runtime 和每张流程单的 request runtime，两个绩效入口不得再读取 `workflowEnabled` 或按状态自行拼提交/审批按钮。

## Tab 配置 (tabConfigs.ts)

```ts
export interface FieldConfig {
  key: string;          // 字段名
  label: string;        // 显示标签
  type: "text" | "fk" | "boolean" | "date" | "select" | "hidden";
  editable?: boolean;   // 是否可编辑
  hidden?: boolean;     // 是否隐藏
  displayField?: string;// 显示时取的字段路径（点号分隔）
}

export interface TabConfig {
  entityType: string;   // 实体类型名
  modelKey: string;     // Prisma 模型名
  fields: FieldConfig[];
  fkFields?: Record<string, { entity: string; displayField: string }>;
  apiPath: string;      // API 基础路径
}
```

## 搜索模块

通用文本匹配统一走 `@workspace/core/search`，HR 业务语义搜索留在 `@workspace/hr/server` 或 `@workspace/hr/ui`：
- `matchText(text, keyword)` — 文本、拼音全拼、拼音首字母统一匹配
- `searchHrAutocomplete(entity, keyword)` — HR 实体/FK 搜索
- `searchEmployeesForAccountLink(keyword)` — 员工账号关联搜索
- `searchAgentEmployeeDirectory(keyword)` — 智能助手员工目录搜索；keyword 必填，只匹配姓名/工号/别名，精确值优先，最多返回 20 名并补主部门/岗位。调用前必须通过 `hr.roster.read`，模型投影原样保留姓名和工号，不携带电话等非必要个人字段。
- `EntitySearchInput` — HR 实体选择输入，字段展示和搜索面板解耦

## API 路由规范

HR roster API 在 `app/api/modules/hr/roster/` 下使用薄 route + typed command；每个聚合只暴露其业务语义允许的方法：

- `GET` — 列表或详情读取（支持各自声明的搜索与筛选）。
- `POST /employees` — 创建员工身份和账号；不同时伪造 Employment / EDP 期间。
- `PUT /employees`、`PUT /employments` — 页面 change set；后者只接受非期间资料修正。
- `GET /edps` — 只读任职期间；不暴露普通 POST / PUT / DELETE。
- `PUT /employee-profiles/[id]/lifecycle` — 人员结构变化的唯一在线写入口。
- Employee / Employment 不暴露 hard delete；离职、身份、账号状态分别由对应业务命令处理。

HR performance API 在 `app/api/modules/hr/performance/` 下：
- `GET /api/modules/hr/performance?view=self|summary` — 返回周期选项、考勤 rows、OKR/工作来源 rows、正式绩效 rows、流程 rows 和指标汇总；缺省为 `self`，`summary` 需独立汇总权限。
- `GET /api/modules/hr/performance/contributions/:audienceType/:audienceId?cycleId=:cycleId` — 读取个人、部门或项目工作空间的只读周期材料；本人只能读取自己的 personal target。
- `GET /api/modules/hr/performance/reviews/:id` — 读取正式绩效详情和 OKR 快照；本人只能读取自己的记录。
- `GET /api/modules/hr/performance/submissions?view=self|summary` — 流程列表缺省按当前发起人过滤，汇总视图需独立汇总权限。
- `POST /api/modules/hr/performance/submissions` — 创建绩效流程草稿。
- `PUT /api/modules/hr/performance/submissions/:id` — 员工/上级/HR 按当前阶段修订 payload。
- `POST /api/modules/hr/performance/submissions/:id/{submit,withdraw,cancel,comment,approve,reject}` — 复用 Platform approval engine。

## Open API

HR 生成资料对外开放 API 使用独立 Open API 注册体系，不复用内部 RBAC `Resource`：

| 能力 | Endpoint | Scope | Runtime parent |
|------|----------|-------|----------------|
| HR 生成资料花名册 | `GET /api/open/v1/hr/generated/roster` | `hr.generated.roster.read` | `hr.roster` |

- 注册源：`packages/platform/open-api-registry.ts` 的 `hr.generated`。
- 控制台：`/settings/api/hr-generated`，进入权限仍是内部 `settings.api`。
- 调用鉴权：`Authorization: Bearer <OpenApiClient secret>` + `OpenApiClientScopeGrant`。
- `runtimeParentResourceKey = "hr.roster"` 只控制模块启停，不继承 `hr.roster` RBAC 授权。

## HR 权限标准

HR 页面、resource policy 和 API contract 使用同一套新 action：

- `hr.entry/read/create/update/delete/grant` — HR L1 入口和普通基础能力。
- `hr.roster.entry/read/create/update/delete/archive/revise/submit/reverse/approve/reject/grant` — 人事基础资料主资源。
- `hr.performance.entry/read/submit/revise/reverse/approve/reject/grant` — 绩效工作台、员工自评、直属上级评分、HR 终评归档。
- `hr.analytics.entry/read/grant` — 人力分析当前只开放查看。
- `hr.roster.generated.entry/read/export/grant` — 花名册生成资料 capability；预览是 `read`，CSV 下载是 `export`。

`archive` 覆盖部门/岗位归档与反归档；审计快照恢复归 `revise`；流程草稿创建、发起审核和再次提交归 `submit`，审批、驳回、撤回分别归 `approve/reject/reverse`。绩效 effective `read` 控制本人页面/API 读取；全员汇总要求目标资源自身的显式 `read`、系统管理员或 `approve/reject`，不能由父级 `hr.read` 或 `submit/revise` 的隐含 read 获得。`submit` 控制员工自评流程，`approve/reject` 控制 HR 归档处理；直属上级是否能处理具体单据由流程 adapter 的处理人解析收窄。root identity 是系统硬编码超级管理员，不写入 RBAC resource 授权表。

**权限继承规则**：
- 岗位授权和部门授权也会生效（通过 `PositionResourceActionGrant` / `DepartmentResourceActionGrant`）。
- 非 capability 的上级资源授权向下级资源继承对应 action；下级权限只向上级派生 `entry`，用于菜单和页面入口。
- capability 不吃上级业务 action，必须显式授予自身 action；但进入 capability 前仍要求 owner resource 可进入。
- 前端只做显示控制，API contract 和 service guard 必须做最终权限校验。

**API 权限映射**：
- API 注册源是 `packages/platform/module-registry.ts` 和 `packages/platform/permission-api-action-policy.ts`。
- 普通 CRUD API 默认按注册的 `resourceKey + requiredActions` 校验，不再靠 HTTP 方法硬推 `read/create/update/delete`。
- workflow、归档、恢复、generated export 等路径在 `permission-api-action-policy` 中显式声明 action；serviceDelegated 路径进入 service/adapter 后再按具体业务对象收窄。
- 内部 `/api/modules/hr/**` 必须命中 API contract 并通过 `createApiRouteHandler` / `createCommandRoute` / 已接入 `requireApiAccess` 的 wrapper；外部 `/api/open/v1/hr/**` 只能使用 Open API scope。
