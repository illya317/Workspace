# Work Package Split Coordination

这份说明用于当前多 agent 并行改造时互相避让。若与用户最新口头指令冲突，以用户最新指令为准。

## 当前本线程负责

- 将原 HR 中的“项目”剥离为独立 Work 业务包。
- 新包为 `packages/work`，模块名为“工作管理”。
- Work 下先承接：
  - 项目：原 HR Project / EmployeeProject 的归属迁移。
  - 工作清单：`/work/tasks`。
  - 工作汇报：`/work/reports`。
  - 历史记录：`/work/history`。
- HR 页面不再展示“项目”入口。
- HR 的批量表格不再展示“项目员工”分组；相关表格迁到 Work 侧独立分组。

## 希望其他 agent 暂不改的范围

- 不要继续在 HR 里新增或修复 Project / EmployeeProject 业务能力。
- 不要把项目相关 UI、API、server service、constants 继续塞回 HR。
- 不要新增 `packages/project`；Project / EmployeeProject 只是旧 DB 表名和兼容概念，业务入口统一叫 Work / 项目。
- 不要为项目/项目再引入新的原生控件；后续应按 Core 控件契约收口。
- 若正在做全局 Core / Platform / Apps 改造，请把 Work 视为新的 Apps 业务包纳入边界检查。

## 当前体验统一任务

Feature 线程正在优先处理 `/work` 模板和项目页面体验。`/work/projects` 的列表显示/隐藏目标交互是左右分栏：

- 展开后左侧显示项目列表。
- 右侧保留当前详情编辑区。
- 不要使用整屏遮罩 overlay。
- 不要灰掉主内容。
- 不要把列表做成覆盖详情区的临时 drawer。

如果需要抽通用页面骨架或可折叠左右分栏布局，应新增或扩展 Core UI 组件；Work 只传入业务列表、详情、字段和 service。Feature 线程不会改 architecture gate、CI、auth enforcement 或 module-system rules。

## Work Project 权限口径

- 模块大于项目对象：`work` disabled 后 `/work` 和所有子页面、`/api/modules/work/*`、Work FK 目标都不可用；`work.projects` disabled 后项目入口、项目页面、项目 API、项目 FK 和 `work.projects.viewAll` 一起失效。
- `work.projects.access/write/delete` 只表示能进入、发起或使用项目功能，不表示能查看全部项目、管理全部项目或删除全部项目。
- 项目对象级权限统一由 `packages/work/server/access.ts` 计算。可见来源是创建人、主导部门负责人、项目 RASCI 成员、显式 `work.projects.viewAll` 和 root admin；可写/管理/删除继续按项目角色和负责人规则收敛。
- `work.projects.viewAll` 是独立全量可见资源，不能设置 `parentKey: "work.projects"`；它只能通过 `runtimeParentKey: "work.projects"` 跟随模块启停。
- `Project.editedBy` 是审计字段，不得用于可见、管理、删除或所有权判断。
- 项目 FK 候选过滤留在 `@workspace/work/server`，`app/api/modules/work/projects/reference-options` 只做路由壳和权限壳。

## 与全局架构改造的关系

- Core：通用 UI 和交互基建，例如下拉、日期、FK 搜索、Tag 输入、确认弹窗、表格、筛选栏。
- Platform：登录、权限、用户、导航、审计、模块注册。
- Apps：HR、Finance、Production、Work 等业务模块，各自拥有自己的 UI、server service、types、constants、import 脚本。

当前 Work 拆分会尽量只触碰原 Project 相关代码，避免替其他 agent 大规模整理旧目录。
