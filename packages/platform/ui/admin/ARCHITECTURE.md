# Admin 管理后台模块架构

## 路由入口

| 页面 | 路由 | 组件 |
|------|------|------|
| 管理后台 | `/settings/admin` | `app/(system)/settings/admin/page.tsx` → `AdminClient.tsx` |

## 页面结构

AdminClient 渲染管理入口：

| Tab | 组件 | 说明 |
|-----|------|------|
| 权限管理 | PermissionsTab / SpacePermissionsTab | 子 tab 为员工、岗位、部门、空间；前三者是资源授权矩阵，空间是个人/部门/公司空间授权入口 |
| 流程策略 | WorkflowPoliciesTab | 维护业务行为和空间行为的流程接入策略 |
| 权限台账 | PermissionLedgerTab | 查看权限授权/撤销审计 |
| 流程台账 | WorkflowLedgerTab | 查看流程策略变更审计 |
| 数据质量 | DataQualityTab | 跨领域规则状态、未解决异常、触发策略和按 L2/部门分流的通知配置 |
| 模块管理 | ModuleManagementTab | 系统管理员维护模块启停 |

## 核心组件链

```
page.tsx
  └─ AdminClient.tsx
       ├─ PermissionsTab              — 员工/岗位/部门资源授权
       ├─ SpacePermissionsTab         — 权限管理下的空间子 tab
       ├─ WorkflowPoliciesTab         — 流程策略配置
       ├─ PermissionLedgerTab          — 权限审计台账
       ├─ WorkflowLedgerTab            — 流程审计台账
       ├─ DataQualityTab               — Platform 数据质量治理与提醒
       └─ ModuleManagementTab
```

## 数据流

1. **AdminClient** 进入员工/岗位/部门权限时加载权限资源树 `/api/settings/admin/permissions`
2. **PermissionsTab** 按 `subjectType`（user/position/department）切换，加载对应授权数据
3. **SpacePermissionsTab** 按空间主体（个人/部门/委员会/公司/项目）选择已接入的任务、项目、模板入口；全局授权管理者可通过工具栏切换全部空间、部门空间和项目空间，项目空间直接使用 `project:{projectId}` 作用域授权
4. **DataQualityTab** 读取 `/api/settings/admin/data-quality`；Platform 通过 `/api/modules/<domain>/internal/data-quality` 调用领域 Provider。领域只判断自己的业务事实，并为异常声明 `resourceKey` 与可选责任部门；Platform 保存规则状态、异常 fingerprint、巡检批次和投递结果
5. **变更触发** 由领域服务在业务写入完成后写入 `DataQualityEvaluationRequest`，workspace-shell 调度器合并消费；每日全量与手工巡检复用同一编排器
6. **API 路由** 在 `app/api/settings/admin/` 下，分功能子目录（permissions、permission-grants、users 等）；空间权限保存由各业务空间 API 自己验权

## API 规范

Admin API 在 `app/api/settings/admin/` 下：

| 端点 | 说明 |
|------|------|
| `/api/settings/admin/permissions` | 权限资源树 |
| `/api/settings/admin/permission-grants` | 统一授权设置 |
| `/api/settings/admin/users` | 用户列表/更新 |
| `/api/settings/admin/system-config` | 系统配置（冲突策略） |
| `/api/settings/admin/workflow-policies` | 流程策略配置 |
| `/api/settings/admin/permission-grant-ledger` | 权限授权台账 |
| `/api/settings/admin/workflow-ledger` | 流程策略台账 |
| `/api/settings/admin/data-quality` | 数据质量工作台、手工巡检、触发与通知策略、企微群通道测试 |

## 权限标准

- 内置 `admin` root 账号 — 拥有全部权限，不属于 RBAC resource
- `/settings/admin` 页面入口要求 root 身份或至少一个资源级授权/配置管理范围；后台资源权限 API 和空间权限 API 分别做最终授权校验
- `manageableResourceKeys` — 进入后台后的实际可管理范围
- 仅内置 `admin` root 账号 — 可见模块管理和系统配置
- 数据质量工作台及其配置、手工巡检和通知测试仅 root 可见；站内提醒按 `L2 + 部门`、部门、L2、未匹配兜底的优先级选择唯一接收规则，并始终按实际 `L2 + 部门` 拆分通知。L2 选择复用账号设置入口使用的模块层级事实，先选 L1、再从该 L1 的子项中选择 L2；接收人选择器只列出已绑定员工的可登录账号，并显示“姓名 · 当前主岗位”，历史配置中的未绑定账号保留但不可继续选择。企微 webhook 密钥只从运行环境读取；企微仍是单一治理群，但消息同样按实际 `L2 + 部门` 分开发送
- 资源级权限通过 RBAC 矩阵管理，支持用户/岗位/部门三种授权对象
- 权限矩阵、空间权限读写属于 `grant`；流程策略、模块启停、系统配置属于 `configure`；台账属于 `audit`
- WorkflowPoliciesTab 的“恢复默认”是配置重置，用 `reset` 图标；不要用 `delete` 表达这类恢复默认操作

前端只做显示控制（按钮隐藏），API 必须做最终权限校验。
