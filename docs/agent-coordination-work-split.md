# Work Package Split Coordination

这份说明用于当前多 agent 并行改造时互相避让。若与用户最新口头指令冲突，以用户最新指令为准。

## 当前本线程负责

- 将原 HR 中的“项目”剥离为独立 Work 业务包。
- 新包为 `packages/work`，模块名为“工作管理”。
- Work 下先承接：
  - 工作计划：原 HR Project / EmployeeProject 的归属迁移。
  - 工作清单：现有 `/works` 能力后续归并。
  - 工作汇报：现有 `/reports` 能力后续归并。
  - 历史记录：现有 `/history` 能力后续归并。
- HR 页面不再展示“项目”入口。
- HR 的批量表格不再展示“项目员工”分组；相关表格迁到 Work 侧独立分组。

## 希望其他 agent 暂不改的范围

- 不要继续在 HR 里新增或修复 Project / EmployeeProject 业务能力。
- 不要把工作计划相关 UI、API、server service、constants 继续塞回 HR。
- 不要新增 `packages/project`；Project / EmployeeProject 只是旧 DB 表名和兼容概念，业务入口统一叫 Work / 工作计划。
- 不要为项目/工作计划再引入新的原生控件；后续应按 Core 控件契约收口。
- 若正在做全局 Core / Platform / Apps 改造，请把 Work 视为新的 Apps 业务包纳入边界检查。

## 当前体验统一任务

Feature 线程正在优先处理 `/work` 模板和工作计划页面体验。`/work/plans` 的列表显示/隐藏目标交互是左右分栏：

- 展开后左侧显示计划列表。
- 右侧保留当前详情编辑区。
- 不要使用整屏遮罩 overlay。
- 不要灰掉主内容。
- 不要把列表做成覆盖详情区的临时 drawer。

如果需要抽通用页面骨架或可折叠左右分栏布局，应新增或扩展 Core UI 组件；Work 只传入业务列表、详情、字段和 service。Feature 线程不会改 architecture gate、CI、auth enforcement 或 module-system rules。

## 与全局架构改造的关系

- Core：通用 UI 和交互基建，例如下拉、日期、FK 搜索、Tag 输入、确认弹窗、表格、筛选栏。
- Platform：登录、权限、用户、导航、审计、模块注册。
- Apps：HR、Finance、Production、Work 等业务模块，各自拥有自己的 UI、server service、types、constants、import 脚本。

当前 Work 拆分会尽量只触碰原 Project 相关代码，避免替其他 agent 大规模整理旧目录。
