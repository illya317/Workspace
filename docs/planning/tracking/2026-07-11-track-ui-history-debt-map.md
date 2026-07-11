# UI 历史债地图

- 状态：completed（零未审核 raw/helper；保留 3 个完整深模块声明）
- Owner：Architecture / UI-system / 各业务 Feature owner
- 基准快照：`a0326e93`；清查期间 main 出现并行的 WorkReport 空间唯一性修复，本文将其标记为进行中，不纳入本任务提交。
- 数据源：`.cache/arch/surface-raw-content.json`、`.cache/arch/ui-helper-purity.json`
- 初始口径：355 个 Surface raw 信号、748 个 helper purity 信号，覆盖 114 个不同文件；信号不是独立任务，两类报告也会重叠。
- 完成口径：两个历史 baseline 已删除；`gate:ui` 当前报告 0 个未审核 raw/helper 违规。未引用的岗位说明书旧渲染已删除；QC workbench 使用固定侧栏、结构化队列卡片和 Platform stage-flow 声明，同时把 QC runtime paper 保留为一个完整 Production 深模块，未把其纸张字段拆成 Core 小声明。

## 三类判定

| 类别 | 含义 | 默认处理 |
|---|---|---|
| A：简单迁移 | 现有 Core/Platform interface 已能表达，只是仍在 callback、JSX、helper 中拼装 | 保持视觉与行为，迁移到 structured spec 或正式 adapter |
| B：需要声明 | 至少两个调用点需要同一种表达能力，当前 interface 只能回退到 ReactNode/render callback | 在正确 seam 增加最小声明，再迁移调用点 |
| C：产品高风险 | 当前形态即使声明化，用户仍可能觉得密、绕、像数据库后台或操作位置不一致 | 先确认产品形态，再决定 interface；禁止先把坏形态固化进 Core |

扫描噪声单列为 N：例如 API `fetch`、树/甘特模型的数组 `push`。它们不属于 UI 产品债，应修正扫描归类或明确登记为非 UI helper。

## 全库页面级地图

### Administration

| 页面/区域 | raw/helper | 主分类 | 直观现状 | 修改方向 |
|---|---:|---|---|---|
| 合同列表、筛选和空状态 | 12 / 21 | A | 合同编号、主体、金额、状态和操作列由 cell callback/column helper 拼装 | 使用现有 text/amount/badge/actions/card specs；筛选声明留在 toolbar/form interface |

### App shell

| 页面/区域 | raw/helper | 主分类 | 直观现状 | 修改方向 |
|---|---:|---|---|---|
| 全局错误页 | 1 / 0 | A | 错误内容直接 JSX | 改为现有 status/message surface |

### Finance

| 页面/区域 | raw/helper | 主分类 | 直观现状 | 修改方向 |
|---|---:|---|---|---|
| 导入上传、预览、结果 | 17 / 54 | A，部分 C | 科目、余额、凭证预览使用多套手写列与通知区；信息密度高但属于专业场景 | 先用现有 number/amount/text/badge/notice 声明收口；不改变导入步骤，另做可用性评审 |
| 科目、凭证、总账、重分类、余额核对 | 74 / 57 | A，少量 B | 多张财务表重复金额、借贷、状态、差异和行操作渲染；凭证有展开行 | 批量迁移结构化 cell；展开凭证明细复用统一 expanded-body 声明 |
| 部门预算、研发预算、预算版本 | 13 / 62 | A | 筛选区、预算表、版本选择由 section helper 持有文案和布局 | 现有 Form/Toolbar/Data specs 足够，移回页面 module 或预算 adapter |
| 成本分析、结构、发货、工资、车间、导入历史、来源追踪 | 38 / 17 | A | 主要是金额/比例/来源列的 callback；来源追踪 modal 独立拼 section | 使用 amount/number/stack/actions；来源追踪形成 Finance 内部 adapter，不进 Core |
| 报表行、报表配置、未映射项、报表复核 | 50 / 42 | A + B，产品风险中 | 报表行与配置行包含层级、展开详情、映射操作和错误分支；未映射区偏后台配置台 | 复用 expanded-body 声明和结构化层级 cell；配置流程先做小范围交互复核，不新增财务专用 Core kind |

### HR

| 页面/区域 | raw/helper | 主分类 | 直观现状 | 修改方向 |
|---|---:|---|---|---|
| 部门/岗位工作台、组织树、岗位说明书、创建面板 | 10 / 135 | A + B + C（高） | 三套导航 panel、组织树、岗位创建和大量岗位说明书 repeatable fields 分散在 builder；页面认知负担大 | 先统一 structured card tree/grouped selector；岗位说明书继续复用现有 repeatable/reference interface；再单独评审信息架构 |
| HR 通用 toolbar、筛选、通用创建、编码表、导出 | 3 / 34 | A + N | toolbar helper 持有文案/状态，部分 `push/fetch` 是扫描噪声 | 迁移既有 Toolbar/Form specs；修正非 UI helper 扫描归类 |
| 员工目录、员工档案、合同、字段分区、历史 | 10 / 17 | A，产品风险中 | 员工目录表和历史表为 callback；合同卡和字段分区在 helper 中拼装 | 用现有 table/record/repeatable/reference；档案页再检查长表单分区，不新增 Employee 专用 Core kind |
| 人员、合同、离职、编制、部门、岗位分析 | 53 / 42 | A，少量 B | 分析页大量表格 cell callback；职位/部门图表 helper 持有标题、状态与 push | 表格先结构化；图表走现有 Visualization adapter；不把数据计算误算为 UI 债 |

### Library

| 页面/区域 | raw/helper | 主分类 | 直观现状 | 修改方向 |
|---|---:|---|---|---|
| 文档表、资料表、目录侧栏 | 12 / 0 | A | 文件名、类型、版本、操作和目录项使用 callback | 使用现有 text/badge/actions/structured cards |

### Platform

| 页面/区域 | raw/helper | 主分类 | 直观现状 | 修改方向 |
|---|---:|---|---|---|
| API 客户端与 Agent/API 访问设置 | 21 / 10 | A，产品风险中 | 客户端、密钥、scope、状态和操作列手写；技术术语密集 | 先结构化表格；密钥/scope 的产品文案另做管理端可用性检查 |
| 权限矩阵、资源树、模块管理、空间权限 | 8 / 13 | A + B，产品风险中 | 资源树 renderItem、矩阵 JSX、钻取 selector 分散；状态含义对非管理员不直观 | 优先复用 selectionGrid/badge/card；若矩阵多模块仍需相同复合状态，再新增 Platform 权限矩阵 adapter，不进 Core |
| 审计记录、部门说明、岗位说明只读视图 | 10 / 44 | B | 审计 diff 和说明书层级内容用大量 JSX/helper；Core record/text 不足以表达稳定 diff 语义 | 新增 Platform `AuditDiff`/description adapters；Core 只保留通用 record/form interface |
| 文档列表与文档模板编辑器 | 1 / 15 | B，产品风险中 | 文档分类 helper；编辑画布通过 Surface raw content 嵌入 | 建立 Platform-owned document-editor body adapter；不能让 Core 依赖编辑器实现 |
| Space workbench 导航与双栏布局 | 0 / 2 | A/B | helper 直接创建 space kind navigation 和 workbench body | 这是已有多消费者 seam；保留小 interface，补齐 structured groups 后缩薄 helper |

### Production

| 页面/区域 | raw/helper | 主分类 | 直观现状 | 修改方向 |
|---|---:|---|---|---|
| QC 批次列表、新建区、批次记录页 | 0 / 0 | 已完成 | 固定侧栏工作台、队列卡片动作、阶段流程板与运行时纸张均通过完整结构边界声明 | 保持截图中的专业阶段密度；新增阶段只声明 workflow 数据，不新增 `qc` Core kind或纸张字段级例外 |

### Work

| 页面/区域 | raw/helper | 主分类 | 直观现状 | 修改方向 |
|---|---:|---|---|---|
| 会议列表与会议详情 | 1 / 74 | C（高） | 会议详情同时铺开参会人、议程、纪要、表决、决议、行动候选；还暴露用户 ID、计划 ID 等内部字段 | 先重排为会议时间线/按需编辑，所有 ID 改 reference picker；现有声明基本够，不为六卡片坏形态补 Core |
| 工作汇报/考核与汇总表 | 4 / 26 | C（高），domain 前置处理中 | 汇总表一行一个 space，但“目标/考核”单元格内嵌完整 PageSurface/记录列表；基准快照的唯一键含 submittedBy | 并行改动正在收口为一空间一份正式汇报；本任务只负责其后的 space-first 汇总 UI，详情区显示该空间报告 |
| 项目列表、项目详情、RASCI、项目甘特 | 4 / 23 | B + C | RASCI 使用复合表头和人员 chips，且禁用横向滚动；项目详情空状态/列表 callback | 增加通用 chip-list/structured-header 后迁移；冻结名称列并允许横向滚动 |
| 工作计划、OKR 大纲、日常工作、甘特、toolbar、空间侧栏 | 9 / 48 | A + B，产品风险中 | 树形表格、展开新建/编辑、计划 header 生命周期按钮、分组 selector 分散 | 简单 cells 先迁移；补 grouped cards/card tree/expanded body；保存提交归档删除继续向 FormSurface action 位置收敛 |
| 部门工作首页 | 0 / 0 | 已清零 | 已迁移为 structured card tree 声明 | 保持 cards-only contract |

## Interface 结论

只新增已有多个消费者证明需要的 seam；已落地项不再保留兼容协议：

1. **Selector grouped cards（已落地）**：Work 空间、承接/协作、汇报周期及其他分组列表直接在结构化 item 上声明 `group`；旧 `itemSource/groupBy` 模式字段已删除。
2. **Selector card tree（已落地）**：Work 部门树、HR 组织树、Platform 资源树统一声明结构化 card children；`renderItem/getChildren` 兼容协议已删除。
3. **Data cell chip/person list 与 structured header**：Work RASCI、HR 人员矩阵及其他人员标签表共同需要。
4. **Data expanded body**：Work 任务、Finance 凭证/报表行等多个展开行需要返回 Form/Body spec，而不是 ReactNode。
5. **Platform AuditDiff adapter**：审计 diff 有稳定业务语义，但不应污染 Core DataSurface。
6. **Platform document-editor body adapter**：文档画布是可复用 Platform 能力，Core 只承载 adapter 输出。
7. **Platform stage-flow adapter**：阶段标题、汇总指标、锁定态和阶段内任务作为一个完整流程板声明；颜色、间距和图标由实现决定。

暂不新增：工作汇报“表格单元格内嵌记录页面”、会议六卡片、QC 专用 Core kind。它们应先解决产品形态或由业务 adapter 承担。

## 用户观感高风险清单

| 优先级 | 页面 | 风险 | 处理前置 |
|---|---|---|---|
| P0 | Work 工作汇报汇总 | 表格单元格嵌完整记录系统，一行可能极高；space/report identity 正由并行改动修正 | 等待并行 migration/service 收口后，只改 space-first 汇总 UI |
| P0 | Work 会议详情 | 六块业务卡片常驻、内部 ID 输入、操作过密 | 先定会议时间线与 reference 交互 |
| P1 | HR 部门/岗位工作台 | 导航层级、创建、岗位说明书和归档集中，认知负担高 | 先统一树/分组 selector，再评审信息架构 |
| P1 | Work RASCI | 多列 chips、无横向滚动、缩写解释弱 | chip/header 声明与表格布局一起改 |
| P1 | Work 计划生命周期 | 同类操作仍可能出现在 header 与 FormSurface 不同位置 | 延续 action runtime/FormSurface 收敛 |
| P1 | Finance 报表配置/未映射项 | 专业操作与错误态密集，像配置后台 | 保持财务语义，简化任务顺序和详情展开 |
| P2 | Platform 权限矩阵/API 设置 | 技术词和状态组合多，非管理员难理解 | 先统一语义标签和详情说明 |
| P2 | Production QC 阶段记录 | 阶段表单与记录密度高且业务 JSX 固化 | 先定义 Production adapter 和阶段任务流 |

## 推荐实施批次

1. **批次 A：零产品变更清债**  
   简单 selectors、普通表格 cells、空状态、amount/number/badge、helper 文案归位，以及 fetch/push 扫描噪声治理。
2. **批次 B：两项已落地、两项待评审**  
   grouped cards 与 card tree 已收进单一 `SelectorSurface` 声明；仅 chip/person list + structured header、expanded body 仍需以至少两个真实调用点证明新 interface。
3. **批次 C：Work 产品债**  
   工作汇报 identity/汇总、会议详情、RASCI、计划生命周期位置。
4. **批次 D：HR 信息架构**  
   部门/岗位导航、岗位说明书、员工档案长表单。
5. **批次 E：Finance 表格群**  
   按导入、账簿、预算、成本、报表配置五个子批次迁移，避免一次改 37 个文件。
6. **批次 F：Platform/Administration/Library/Production 收口**  
   AuditDiff、document editor adapter、权限矩阵、合同/资料表和 QC adapter。

## 验收口径

- 每批先跑 `npm run gate:ui`，不得增加 baseline。
- A 类保持截图和交互等价；B 类必须证明至少两个消费者；C 类必须有产品形态确认。
- 每批同步记录 raw/helper 减量，但不把 scanner 信号数当作完成度唯一指标。
- 最终目标不是机械归零，而是：业务页面只声明数据、状态和 action；Core/Platform module 隐藏布局与语义实现；高风险页面得到更清晰的任务流。
