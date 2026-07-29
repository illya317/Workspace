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
| 数据关系 | DatabaseRelationsTab | root 只读查看当前 PostgreSQL Schema 的数据表、字段、主键和外键关系图 |
| 模块管理 | ModuleManagementTab | 左栏维护模块启停；右栏独立展示构建时源码模块分析 |

## 核心组件链

```
page.tsx
  └─ AdminClient.tsx
       ├─ PermissionsTab              — 员工/岗位/部门普通资源授权
       ├─ WorkflowPoliciesTab         — 流程管理下的设置子 tab
       ├─ WorkflowLedgerTab           — 流程管理下的台账子 tab
       ├─ SpacePermissionsTab         — 员工/岗位/部门空间资源授权
       ├─ PermissionLedgerTab         — 权限管理下的台账子 tab
       ├─ BusinessCodeConfigTab       — 跨业务编码规则
       ├─ DatabaseRelationsTab        — 当前数据库 Schema 与 FK 关系图
       └─ ModuleManagementTab
```

## 数据流

1. **AdminClient** 进入员工/岗位/部门权限时加载权限资源树 `/api/settings/admin/permissions`
2. **PermissionsTab** 的子 tab 只按 `subjectType`（user/position/department）切换；toolbar 的普通/空间分段控制资源投影，不把空间混入授权主体维度
3. **SpacePermissionsTab** 按空间实例（部门/委员会/公司/项目）选择已接入的任务、项目、模板资源，并复用统一权限矩阵与 `/api/settings/admin/permission-grants`；员工、岗位、部门都携带具体 `scopeId` 和 `projection=space` 读写，项目空间直接使用 `project:{projectId}` 作用域授权
4. **API 路由** 在 `app/api/settings/admin/` 下，分功能子目录（permissions、permission-grants、users 等）；管理后台的普通/空间矩阵统一走 `permission-grants`，各业务页面内的空间授权入口仍由对应业务空间 API 自己验权
5. **模块分析** 在 dev/build 期间由 `scripts/arch/source-code-analysis/cli.ts` 尽力生成 snapshot；`module-management` service 只读取 snapshot，不在管理请求中扫描源码。页面复用现有 BodySurface 固定 3:7 分栏，左侧模块树和右侧分析矩阵的数据与交互相互独立。生成或读取失败时只隐藏分析结果，不得影响左侧模块树、管理 API 或任何业务功能
6. **编码管理** 通过 `/api/settings/admin/system-config` 读取和保存 `businessCodeConfig`，使用 Core `createMasterDetailBody`：左侧为紧凑的系统/自定义模板列表，右侧顶部用与 HR 直属岗位相同的两列 selection grid 显示“关联编码对象”，卡片只呈现编号样例和对象名称，其后才是当前模板详情或编辑表单，不再维护独立“编码”视图。系统模板携带完整 baseline 规则、默认只读并可复制；`+` 从空白 block 开始，用同一套“条件分支 + 编码组成 + 独立流水作用域”编辑器重建任意系统模板，不再选择基础结构或进入组织/岗位/项目专用页面。每条条件分支同时显示适用条件和自己的完整示例。自定义模板的编辑、删除、保存和取消进入右侧 `FormSurface.actions`，不在底部堆动作。编码对象由后端 registry 只读登记；关联区右上角 `+` 新增兼容关系，点击卡片改绑模板，区块保存后立即持久化。新增后台编码对象必须先进入 Platform canonical registry，页面不得维护平行对象列表。模板完整规则快照留在 `management.templates[].settings`，Platform `business-code-template` 负责统一解析和预览，`business-code-management` 通过严格 Adapter 编译为现有员工、组织、岗位、客户、供应商、项目和资产后端配置。组织简称、公司、资产分类等仍由业务主数据提供；模板只声明这些值在组合结构中的位置。Finance 资产继续使用带规则版本、幂等凭证和原子占号的 `business-codes` 深模块，页面只维护规则，不参与最终占号。registry 生成文档和 `business-code:check` / `docs:check` 保证新增后台编码对象必须登记并自动出现在页面。
7. **数据关系** 通过 `/api/settings/admin/database-schema` 只读查询 PostgreSQL 系统目录。接口返回当前数据库和 Schema 下的物理表、字段、字段中文注释、主键、FK 与删除策略；字段存在中文注释时，字段清单、搜索和关系文案统一优先显示中文名。UI 使用自动铺满画布的力导向圆点地图展示全库拓扑，默认节点不显示文字并统一使用 Obsidian 风格的中性深灰，节点直径按 FK 连接数使用无硬截断的软饱和曲线增长。全库图先用 Louvain 按 FK 拓扑密度发现社区，并把过多的微型社区按最强跨社区连接收敛为少数可读关系岛；聚类力负责岛内形状和跨岛连线，布局结束后把有 FK 的社区确定性圆形装箱进中心圆盘，无 FK 表使用黄金角螺旋形成随面积增长的紧凑卫星簇，不再扩张成包围全图的单一外环。初排后 UI 还按实际圆直径执行确定性碰撞消解，并使用高于最低防重叠要求的留白降低密集感，不能依赖布局的近似 `preventOverlap`。节点不可拖拽，只允许拖动画布和缩放，避免手工位移破坏自动分组并消除拖动重排闪烁；首次布局、滚轮缩放、缩小按钮和“适应画布”统一遵守 `0.5` 的最小缩放，超大图允许平移查看但不能缩成不可读缩略图。悬停节点时显示当前表名及其向外引用的目标表名，不显示引用当前表的入向节点名；橙线及橙色目标节点表示当前表引用其他表，蓝线及蓝色来源节点表示其他表引用当前表，不显示 FK 箭头。自引用 FK 不画 self-loop，改用低饱和橙棕色描边，并在悬停时显示节点名。页面支持业务域筛选、搜索定位和单表一跳/两跳查看。局部关系图的返回入口固定在图内，桌面端也可在图内右键返回全库。排列算法集中在 Core 的 MapLayout 深模块，视口限制集中在 MapViewport 深模块，渲染层不得重新声明社区、圆环或缩放规则。该能力不查询业务记录，不提供 DDL 或字段编辑入口

源码分析以 declared analysis unit 为行、文件 role 为列。后端快照保留产品 L1、系统能力、共享架构、组合层、数据工程和工程支撑的精确分类；页面不增设“类别”列，只把这些行视觉归并为“产品模块 / 共享与底座 / 工程体系”三个段落。`ops/` 自动归生产运行，`scripts/` 默认归开发治理，确实被 release/runtime 消费的脚本通过集中注册表转入生产运行，两个单元始终独立统计。Prisma schema/migration 进入数据底座，Zod schema 仍归对应业务单元的输入边界。页面顶部用五类职责构成图先给出总量占比，矩阵默认展示 UI、边界、业务、数据访问和其他职责；“边界”可展开输入、领域校验和契约，“其他”可展开外部集成、组合壳、模块测试和工程实现。同一时间只展开一组，再次点击列头收起；聚合值始终等于展开明细之和。页面壳归组合层。点击有代码的职责格只改变右侧分析选择，不联动左侧模块树；选中格引用出去的目标格显示蓝色，引用选中格的来源格显示橙色，双向引用显示绿色，自引用保持橙色，其余有代码的职责格弱化，选中格本身仅使用中性描边。关系按后端 `module + role -> module + role` import 边计算；当前展开明细仍沿用所属聚合列的整体关系，不单独拆分。矩阵“总代码”用 Core meter 表达相对体量，数值仍是权威口径；末行逐列汇总，顶部显示源码总量、未解耦混合职责和循环依赖；未解耦混合职责必须为零，否则 `source-code-analysis:check` 与 `gate:domain` 失败。声明覆盖率保留在 snapshot 和 gate 中，不在页面重复展示。声明、门禁和统计口径见 `docs/engineering/deep-module-design.md`。

业务资料异常提醒不属于 Admin 工作台。Platform 在开发和生产运行自动巡检生产者：每日 08:30 全量巡检，业务资料变更后增量复检；领域 Provider 只判断自己的业务事实并声明 `resourceKey`。通知 contract 同时声明自动触发是否运行、真实发送渠道和订阅资格；个人在 `/settings/account?tab=subscriptions` 订阅，当前渠道为站内通知，投递时再次校验对应资源的 `read` 权限。

## API 规范

Admin API 在 `app/api/settings/admin/` 下：

| 端点 | 说明 |
|------|------|
| `/api/settings/admin/permissions` | 权限资源树 |
| `/api/settings/admin/permission-grants` | 统一授权设置 |
| `/api/settings/admin/users` | 用户列表/更新 |
| `/api/settings/admin/system-config` | 系统配置（冲突策略、智能体动作上限、业务编码规则） |
| `/api/settings/admin/database-schema` | 当前数据库 Schema、字段与 FK 关系（root 只读） |
| `/api/settings/admin/workflow-policies` | 流程策略配置 |
| `/api/settings/admin/permission-grant-ledger` | 权限授权台账 |
| `/api/settings/admin/workflow-ledger` | 流程策略台账 |

## 权限标准

- 内置 `admin` root 账号 — 拥有全部权限，不属于 RBAC resource
- `/settings/admin` 页面入口要求 root 身份或至少一个资源级授权/配置管理范围；后台资源权限 API 和空间权限 API 分别做最终授权校验
- `manageableResourceKeys` — 进入后台后的实际可管理范围
- 仅内置 `admin` root 账号 — 可见模块管理和系统配置
- 仅内置 `admin` root 账号 — 可见只读数据关系图
- 编码规则属于 root 系统配置；修改只影响之后的新建和未入库导入，不追溯重算既有业务记录
- 资源级权限通过 RBAC 矩阵管理，支持用户/岗位/部门三种授权对象
- 权限矩阵、空间权限读写属于 `grant`；流程策略、模块启停、系统配置属于 `configure`；台账属于 `audit`
- WorkflowPoliciesTab 的“恢复默认”是配置重置，用 `reset` 图标；不要用 `delete` 表达这类恢复默认操作

前端只做显示控制（按钮隐藏），API 必须做最终权限校验。
