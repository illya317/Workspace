# Mobile Experience Contract

Workspace 的移动端不是桌面页面的缩小版。紧凑屏幕用“时间换空间”：先选择栏目或记录，再进入占满屏幕的详情；只有需要同时核对多列、时间轴或画布的任务进入横屏工作台；不适合触屏完成的治理任务不提供手机入口。

设计依据：Apple 的 [Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables) 用列表承载层级导航；Android 的 [Adaptive apps](https://developer.android.com/develop/adaptive-apps/guides/get-started-with-adaptive-apps) 在紧凑窗口只显示 list 或 detail，在展开窗口同时显示；SAP Fiori 的 [Responsive table](https://experience.sap.com/fiori-design-web/responsive-table/) 和 [Table overview](https://experience.sap.com/fiori-design-web/table-overview/) 要求手机只保留关键列，分析/网格表提供低复杂度替代界面，而不是原样压缩桌面表。

## Source of truth

- 每个 L2 必须在 `packages/platform/module-registry.ts` 声明 `mobileExperience.strategy`。
- `native`：竖屏原生流程；split 由 Core 渐进为“列表全屏 -> 详情全屏 -> 返回列表”。
- `landscape`：竖屏只展示进入横屏工作台的说明；手机横屏时内容覆盖 AppShell，保留紧凑退出栏。
- `unavailable`：L1 的手机目录不展示入口；直接访问时只显示“手机端暂不提供”和返回动作。
- 深路由可以用 `mobileExperience.overrides` 覆盖 L2 默认策略，例如模板列表为 `native`，模板详情编辑为 `landscape`。

## L2 audit

| L1 | L2 | 策略 | 移动端任务形态 |
|---|---|---|---|
| 工作管理 | 工作空间 | native | 空间选择、计划列表、详情渐进 |
| 工作管理 | 项目管理 | native | 项目列表进入单项目详情；甘特图自身进入横屏专注模式 |
| 工作管理 | 会议管理 | native | 会议列表进入单会议详情 |
| 人事管理 | 人事基础资料 | native | 目录、人员列表、单员工详情 |
| 人事管理 | 绩效管理 | native | 对象选择、材料与流程详情 |
| 人事管理 | 人力分析 | native | 指标和短列表；矩阵自动横屏 |
| 行政管理 | 合同台账 | native | 合同连续列表、单合同编辑 |
| 财务管理 | 总账会计 | native | 台账连续列表；矩阵子视图自动横屏 |
| 财务管理 | 财务报表 | landscape | 保留科目层级、期间和金额列的横屏报表工作台 |
| 财务管理 | 管理会计 | native | 指标、图表、短列表；矩阵自动横屏 |
| 财务管理 | 预算管理 | native | 版本与对象渐进；月度矩阵自动横屏 |
| 财务管理 | 成本管理 | native | 业务对象列表与来源追溯 |
| 财务管理 | 税务管理 | native | 规划中入口，沿用原生信息页 |
| 财务管理 | 司库管理 | native | 规划中入口，沿用原生信息页 |
| 财务管理 | 数据导入与治理 | unavailable | 文件映射、异常核对只在桌面端开放 |
| 生产管理 | 批次检验 | native | 批次列表、阶段目录、移动端字段表单；纸面只在桌面显示 |
| 存货管理 | 库存运营 | native | 物料/单据/批次连续列表 |
| 外部关系 | 客户管理 | native | 主体列表进入详情 |
| 外部关系 | 供应商管理 | native | 主体列表进入详情 |
| 资本证券 | 投资人关系 | native | 信息入口和后续关系记录 |
| 资本证券 | 治理架构 | native | 组织选择进入单节点详情 |
| 文档中心 | 公司管理 | native | 文档阅读 |
| 文档中心 | 报销规范 | native | 文档阅读 |
| 文档中心 | 模板编辑器 | native | 模板目录原生；`/templates/*` 详情横屏 |
| 资料库 | 基本资料 | native | 文件连续列表进入阅读/元数据详情 |
| 设置 | 账号与接入 | native | 分章节设置 |
| 设置 | 系统管理 | native | 管理对象列表；权限矩阵自动横屏 |
| 设置 | API 接入 | native | Client/Scope 列表进入详情 |
| 设置 | UI 组件库 | unavailable | 开发治理工具只在桌面端开放 |

当前计数：26 个 L2 原生竖屏、1 个 L2 横屏、2 个 L2 手机端不开放；另有模板详情、甘特图和所有矩阵 DataSurface 的局部横屏策略。

## Table and frame rules

- 普通 `DataSurface kind="table"` 在手机端使用一个连续列表容器和行分隔，不允许每行重复圆角、边框、背景和阴影。
- 每行默认只展示第一列主标题和后两列摘要；其余字段进入“更多信息”，有 `onRowClick` 时显示 disclosure 并进入业务详情。
- `format.kind="matrix"` 默认 `mobile.presentation="landscape"`，必须保留桌面列关系，不得转换成卡片。
- 表格 section 在手机端贴合 section 边缘，外层 section 是唯一 frame；禁止 Page/Section/Table/Row 四层 frame 叠加。
- 业务可声明 `mobile.presentation: list | landscape | unavailable`，但只决定呈现策略，不得复制数据状态或动作协议。

## Frontend and backend boundary

- App route/server composition root 负责鉴权、权限布尔值和首屏 DTO；`packages/*/ui` 只接收 DTO、权限结果和 action handler。
- UI 不得 import `@workspace/*/server`、相对 `server/*` 或 Prisma；`scripts/check/check-architecture-governance.js` 阻断新增倒流。
- 移动端和桌面端必须共享同一 DTO、字段模型、权限结果和 API action contract。响应式分支只改变信息架构，不产生第二套业务状态。
- 写入仍走 `API route -> Zod request shape -> domain validator -> service/Prisma`；移动端不得绕过 API 直接调用 service。

## Verification

- 代表性竖屏宽度：360、390、430；同时验证短屏底部栏和 safe area。
- 横屏工作台至少验证 667×375 和 844×390；确认 AppShell 底栏被覆盖、关键列可横向浏览、旋回竖屏后回到说明页。
- 每类至少覆盖一个 L2：native（批次检验/项目）、landscape（财务报表）、unavailable（数据导入）。
- Core 结构变更执行 `CORE_UI_CHANGE=1 npm run gate:ui`、`npm run gate:domain`、`npm run typecheck:quick` 和相关 E2E。
