# Admin 管理后台模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 管理后台 | `/settings/admin` | `app/(modules)/settings/admin/page.tsx` → `AdminClient.tsx` |

## 页面结构

AdminClient 渲染管理入口：

| Tab | 组件 | 说明 |
|-----|------|------|
| 流程管理 | WorkflowPoliciesTab / WorkflowLedgerTab | 子 tab 为设置、台账；分别维护流程接入策略和查看流程策略变更审计 |
| 权限管理 | PermissionsTab / SpacePermissionsTab / PermissionLedgerTab | 子 tab 为员工、岗位、部门、台账；前三者固定表达授权主体，toolbar 在普通资源与空间资源之间切换，台账查看权限授权/撤销审计 |
| 编码管理 | BusinessCodeConfigTab | root 维护员工、组织、岗位、客户、供应商、项目和财务资产的默认编码规则 |

## 核心组件链

```
page.tsx
  └─ AdminClient.tsx
       ├─ PermissionsTab              — 员工/岗位/部门普通资源授权
       ├─ WorkflowPoliciesTab         — 流程管理下的设置子 tab
       ├─ WorkflowLedgerTab           — 流程管理下的台账子 tab
       ├─ SpacePermissionsTab         — 员工/岗位/部门空间资源授权
       ├─ PermissionLedgerTab         — 权限管理下的台账子 tab
       └─ BusinessCodeConfigTab       — 跨业务编码规则
```

## 数据流

1. **AdminClient** 进入员工/岗位/部门权限时加载权限资源树 `/api/settings/admin/permissions`
2. **PermissionsTab** 的子 tab 只按 `subjectType`（user/position/department）切换；toolbar 的普通/空间分段控制资源投影，不把空间混入授权主体维度
3. **SpacePermissionsTab** 按空间实例（部门/委员会/公司/项目）选择已接入的任务、项目、模板资源，并复用统一权限矩阵与 `/api/settings/admin/permission-grants`；员工、岗位、部门都携带具体 `scopeId` 和 `projection=space` 读写，项目空间直接使用 `project:{projectId}` 作用域授权
4. **API 路由** 在 `app/api/settings/admin/` 下，分功能子目录（permissions、permission-grants、users 等）；管理后台的普通/空间矩阵统一走 `permission-grants`，各业务页面内的空间授权入口仍由对应业务空间 API 自己验权
5. **编码管理** 通过 `/api/settings/admin/system-config` 读取和保存 `businessCodeConfig`，使用 Platform 分类/直属子项/详情工作台：左侧为紧凑的系统/自定义模板列表，右侧顶部用与 HR 直属岗位相同的两列 selection grid 显示“关联编码对象”，卡片只呈现编号样例和对象名称，其后才是当前模板详情或编辑表单，不再维护独立“编码”视图。系统模板携带完整 baseline 规则、默认只读并可复制；`+` 从空白 block 开始，用同一套“条件分支 + 编码组成 + 独立流水作用域”编辑器重建任意系统模板，不再选择基础结构或进入组织/岗位/项目专用页面。每条条件分支同时显示适用条件和自己的完整示例。自定义模板的编辑、删除、保存和取消进入右侧 `FormSurface.actions`，不在底部堆动作。编码对象由后端 registry 只读登记；关联区右上角 `+` 新增兼容关系，点击卡片改绑模板，区块保存后立即持久化。新增后台编码对象必须先进入 Platform canonical registry，页面不得维护平行对象列表。模板完整规则快照留在 `management.templates[].settings`，Platform `business-code-template` 负责统一解析和预览，`business-code-management` 通过严格 Adapter 编译为现有员工、组织、岗位、客户、供应商、项目和资产后端配置。组织简称、公司、资产分类等仍由业务主数据提供；模板只声明这些值在组合结构中的位置。Finance 资产继续使用带规则版本、幂等凭证和原子占号的 `business-codes` 深模块，页面只维护规则，不参与最终占号。registry 生成文档和 `business-code:check` / `docs:check` 保证新增后台编码对象必须登记并自动出现在页面。

数据关系、模块管理和源码分析已经迁移到 `/settings/governance`。现有实现文件暂时保留在 `packages/settings/ui/admin/tabs/` 供平台治理页面复用，但 `AdminClient` 不再展示或加载这些能力。

源码分析 snapshot 是可重建生成物而非租户配置：dev 在数据库预检前生成，build 与 artifact 组装强制生成并验证复制结果；缺失父目录由生成器建立。运行时只读装配后的不可变文件，不在页面请求中扫描源码。

源码分析以 declared analysis unit 为行、文件 role 为列。后端快照保留产品 L1、系统能力、共享架构、组合层、数据工程和工程支撑的精确分类；页面不增设“类别”列，只把这些行视觉归并为“产品模块 / 共享与底座 / 工程体系”三个段落。`ops/` 自动归生产运行，`scripts/` 默认归开发治理，确实被 release/runtime 消费的脚本通过集中注册表转入生产运行，两个单元始终独立统计。Prisma schema/migration 进入数据底座，Zod schema 仍归对应业务单元的输入边界。矩阵按默认依赖方向展示入口、业务、适配、契约和保障；入口展开组合壳/UI/输入，业务展开业务实现/领域校验，适配展开数据访问/外部集成，保障展开模块测试/工程实现。同一时间只展开一组，再次点击列头收起；聚合值始终等于展开明细之和。页面壳归组合层。点击聚合格按其 raw role 集合分析，点击展开明细则精确到单一 raw role：来源显示蓝色、目标显示橙色，折叠聚合两侧都有 import 时仍保持普通方向提示，只有后端文件 SCC 证明的真实循环显示绿色。自引用和选中格保持中性；折叠只能把同一个真实 SCC 向上投影，不能把两条无关方向边合成绿色。矩阵“总代码”用 Core meter 表达相对体量，数值仍是权威口径；末行逐列汇总，顶部显示源码总量、未解耦混合职责和真实文件循环；文件循环或未解耦混合职责非零时 `source-code-analysis:check` 与 `gate:domain` 失败。声明覆盖率保留在 snapshot 和 gate 中，不在页面重复展示。声明、门禁和统计口径见 `docs/engineering/deep-module-design.md`。

业务资料异常提醒不属于 Admin 工作台。Platform 在开发和生产运行自动巡检生产者：每日 08:30 全量巡检，业务资料变更后增量复检；领域 Provider 只判断自己的业务事实并声明 `resourceKey`。通知 contract 同时声明自动触发是否运行、真实发送渠道和订阅资格；个人在 `/settings/account?tab=subscriptions` 订阅，当前渠道为站内通知，投递时再次校验对应资源的 `read` 权限。

## API 规范

Admin API 在 `app/api/settings/admin/` 下：

| 端点 | 说明 |
|------|------|
| `/api/settings/admin/permissions` | 权限资源树 |
| `/api/settings/admin/permission-grants` | 统一授权设置 |
| `/api/settings/admin/users` | 用户列表/更新 |
| `/api/settings/admin/system-config` | 系统配置（冲突策略、智能体动作上限、业务编码规则） |
| `/api/settings/admin/workflow-policies` | 流程策略配置 |
| `/api/settings/admin/permission-grant-ledger` | 权限授权台账 |
| `/api/settings/admin/workflow-ledger` | 流程策略台账 |

## 权限标准

- 内置 `admin` root 账号 — 拥有全部权限，不属于 RBAC resource
- `/settings/admin` 页面入口要求 root 身份或至少一个资源级授权/配置管理范围；后台资源权限 API 和空间权限 API 分别做最终授权校验
- `manageableResourceKeys` — 进入后台后的实际可管理范围
- 仅内置 `admin` root 账号 — 可见系统配置
- 编码规则属于 root 系统配置；修改只影响之后的新建和未入库导入，不追溯重算既有业务记录
- 资源级权限通过 RBAC 矩阵管理，支持用户/岗位/部门三种授权对象
- 权限矩阵、空间权限读写属于 `grant`；流程策略和系统配置属于 `configure`；台账属于 `audit`
- WorkflowPoliciesTab 的“恢复默认”是配置重置，用 `reset` 图标；不要用 `delete` 表达这类恢复默认操作

前端只做显示控制（按钮隐藏），API 必须做最终权限校验。
