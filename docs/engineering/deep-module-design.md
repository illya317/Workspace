# 深模块与意图接口设计规范

Workspace 默认设计深模块：把大量行为和实现知识收进模块，只向调用者暴露小而稳定的接口。这里的调用者既包括代码，也包括操作页面的人；UI 是模块的人类接口，不是后端字段、状态机和 action registry 的可视化展开。

本项目把“声明式意图接口”和“构造即正确”作为深模块的验收条件，而不是三个互不相关的口号：

> 复杂度收进深模块；接口只表达业务意图；非法状态在接口处被阻止，并返回准确、可操作的错误。

## 1. 统一术语

- **Module（模块）**：任何同时具有 interface 和 implementation 的结构，可以是函数、类、package 或跨层业务切片。
- **Interface（接口）**：调用者为了正确使用模块必须知道的一切，不只包括 TypeScript 类型，还包括业务不变量、调用顺序、错误模式、必需配置和人类 UI 中可见的字段、选项与动作。
- **Implementation（实现）**：接口背后的编排、状态机、派生、校验、持久化和基础设施细节。
- **Depth（深度）**：调用者每学习一个接口概念可以获得多少可靠行为。深模块以少量接口承载大量行为；浅模块只是把实现复杂度换一种形式摊给调用者。
- **Seam（接缝）**：模块接口所在、允许替换实现而不修改调用方的位置。

深度不按“实现行数 / 接口行数”衡量。只有当接口产生高杠杆，并把知识、变更、错误和验证集中到模块内部时，模块才真正有深度。

## 2. 给人的 UI 也是模块接口

数据库枚举、完整生命周期、工作流节点、内部动作、权限矩阵和技术配置都是实现事实。它们可以很复杂，但不得因为已经存在就自动变成前端字段、按钮或候选项。

### 硬规则

- **后端生命周期复杂度不得直接展开成前端选项集合。** 禁止从 status enum、transition table、action registry、schema 字段或权限动作机械生成一整套可选 UI。
- UI 默认只呈现当前对象、当前权限和当前业务上下文下合法的下一步**业务意图**，例如“提交审核”“批准”“撤回”“办理离职”“发布修订”，而不是让用户选择 source state、target state、transition kind、执行阶段或内部 handler。
- 能由当前状态、权限、关联事实或用户意图唯一推导的值必须由模块派生，不再要求用户选择。让用户确认系统已推导的结果，不等于把推导参数全部暴露给用户。
- 多个真实的人类决策不得平铺成一个巨大表单或长选项表。按任务分步、分组并渐进披露；低频例外进入明确的例外入口，不能干扰主路径。
- 字段标签已经能表达语义时，不用大段说明文字为复杂接口补锅。若用户必须先读实现说明才能选择，说明 interface 仍然过浅，应先收回选项和机制。
- UI 的候选项必须代表用户真正需要决定的业务事实。仅用于存储、派生、审计、并发、路由或内部编排的字段不得成为普通编辑项。

如果一个生命周期有几十个状态或几万个理论组合，模块可以在内部处理这些复杂度；用户不应理解整张状态图才能完成眼前任务。只有确实需要人作出的合法业务决策才进入 interface。

### 选择形态

- 单次、明确的业务决定优先表现为上下文动作，而不是可任意编辑的 `status` 字段。
- 有自然先后关系的选择使用 progressive disclosure：先完成当前决定，再出现下一项。
- 语义重要、需要逐项核对的多值引用使用逐行渐进字段；紧凑、短值、主要用于快速增删的集合才使用 tag/chip。
- 高风险、不可逆或合规动作需要确认和影响说明；普通动作不要因为内部实现复杂而增加额外确认层。

## 3. 给代码的接口同样只表达意图

调用方负责提供业务意图和无法推导的业务事实；模块负责：

- 选择内部步骤和执行顺序。
- 解析当前状态并选择合法转换。
- 派生可计算字段和默认值。
- 执行权限之外的领域不变量检查。
- 处理事务、并发版本、审计、通知和持久化。
- 把内部错误映射为稳定、可纠正的接口错误。

即使一个函数只有一个方法和一个参数，如果调用者仍需记住大量隐藏的字段组合、顺序约束或重试规则，它仍是浅模块。反过来，一个好的 intent command 可以在内部组合多个小实现和 internal seam，而不把它们暴露为外部 interface。

使用 deletion test 检查深度：假设删除该模块，如果复杂度会重新散落到多个调用方，模块正在提供价值；如果复杂度随模块一起消失，它多半只是 pass-through。

## 4. 构造即正确与错误局部化

写入保持统一链路：

```txt
human/code intent
  -> input adapter / UI prevention
  -> Zod request-shape parsing
  -> domain command + domain validator
  -> service / Prisma transaction
```

- UI 负责输入体验、合法候选、即时提示和防止明显误操作，但不是安全边界。
- Zod 只解析请求形状，例如对象、数组、正整数 ID 和必需字段；不要让 route schema 承担记录归属、状态转换或跨字段业务规则。
- Domain validator 负责枚举语义、日期范围、FK 存在且 active、记录归属、状态转换、跨字段/跨行规则和引用保护。
- Service 只消费已经验证的 command，负责事务、持久化、派生、审计和稳定错误映射。
- 页面、导入、agent tool 和内部 API 只能增加 input adapter，必须汇入同一个 domain command 和 validator，不能各自复制业务校验。
- 对可以独立修正的表单、批量行和导入问题，优先一次返回全部结构化问题，并能定位到字段、行或动作；权限失败、并发冲突、未知状态和无法安全继续的情况继续 fail closed。
- 不得依赖 Prisma 或数据库报错代替业务校验，也不得只返回无法行动的 `Invalid input`。

正确性并不会由“深模块”这个名字自动产生；它是深度的验收条件。若非法组合仍需每个调用方自行规避，业务知识已经泄漏到 interface，模块就不够深。

## 5. 反模式与正确形态

浅生命周期 UI：

```txt
用户选择：当前状态 + 目标状态 + 转换类型 + 工作流模式 + 生效策略 + 内部动作
前端按后端完整状态机生成所有候选项
用户必须理解技术组合是否合法
```

深模块 UI：

```txt
系统根据当前对象、权限和上下文给出合法业务动作
用户选择：提交审核 / 撤回 / 发布修订
用户只补充该意图无法推导的业务事实
模块构造 command，domain validator 验证，service 原子提交
```

把一万个选项装进搜索框、折叠面板或“高级设置”仍然是浅接口；改变容器不会消除泄漏的复杂度。

## 6. 设计与 Review 验收

新增或修改模块、Surface、表单、生命周期或写入口时，至少回答：

1. 调用者是在声明业务目标，还是在编排实现步骤？
2. UI 是否暴露了存储状态、完整状态机、内部 action、权限或 schema 字段？
3. 当前界面是否只显示此刻合法且需要人决定的选项？
4. 哪些字段可以从上下文推导，因此应从 interface 删除？
5. 用户是否必须理解大量字段组合或先后顺序才能避免错误？
6. 所有写入入口是否汇入同一个 domain command 和 validator？
7. Zod 和 domain 错误能否定位到具体字段、行、对象或动作，并告诉用户如何纠正？
8. 测试是否通过模块 interface 断言可观察行为，而不是穿透 interface 锁死内部实现？
9. 删除该模块后，复杂度会集中消失，还是重新散落到多个调用方？

出现以下任一情况，应拒绝设计并先深化模块：

- 从 enum、schema、transition table 或 action registry 自动铺满 UI。
- 用可编辑 `status` 代替明确的生命周期 command。
- 要求用户或调用方选择可由模块推导的技术参数。
- 用更多说明文字、搜索或折叠来掩盖选项爆炸。
- 在 route、页面、导入器和 agent tool 中分别实现业务校验。
- 错误只能在 service 深处或数据库写入时发现，且无法定位或纠正。

## 7. 源码模块声明与自动分析

源码统计只允许消费架构声明，不能用行数反向决定模块边界。Workspace 把两个概念分开：

- **declared analysis unit** 是源码的唯一所有权边界。产品 L1 和具有稳定 seam 的系统能力属于真实模块；组合层、数据底座、生产运行、开发治理是为完整归属而声明的架构或工程单元，不伪装成产品 L1。
- **role** 是文件在归属单元内部承担的职责投影：`UI / 输入边界 / 领域校验 / 业务实现 / 数据适配 / 外部集成 / 组合壳 / 契约声明 / 测试 / 工程实现`。role 方便观察代码分布，但 role 本身不自动构成模块。

分析矩阵的纵向单元固定分组如下：

| 类别 | 分析单元 |
|---|---|
| 产品 L1 | Work、HR、Administration、Finance、Production、Inventory、External、Capital Securities、Library、Settings、Docs、Agent |
| 共享架构 | Core、Platform |
| 组合层 | 组合层 |
| 数据工程 | 数据底座 |
| 工程支撑 | 生产运行、开发治理 |

`生产运行` 固定归属 `ops/` 中的发布、部署和运行控制面，以及被正式 release/runtime 明确复制或调用的 `scripts/import`、`scripts/migrate`、`scripts/repair`、Agent runtime 和少量生命周期 helper；`开发治理` 归属其余 `scripts/`、`e2e/`、`next.config.ts` 与 `playwright.config.ts` 中的检查、生成、测试和工程脚本。两者保持独立文件夹语义和独立展示：`ops/` 自动归生产运行，`scripts/` 默认自动归开发治理；必须参与生产运行的脚本统一注册到 `PRODUCTION_RUNTIME_SCRIPT_REGISTRATIONS`，再由同一归属解析器自动排除出开发治理。脚本进入该注册表必须有制品或控制面调用证据，不能只凭文件名猜测，也不在每个文件内重复写易漂移的归属注释。Schema 按语义归属：Zod/请求 schema 属于对应业务单元的输入边界，domain validator 属于领域校验，Prisma schema 与 migration 属于数据底座，不能重新聚合成一个横切所有业务的笼统 `Schemas` 模块。

页面和 API 壳归 `composition` 或 `input` role。它们负责接近入口处的拼装、认证、请求形状和挂载，不拥有被拼装模块的业务行为；壳代码少而浅是正确形态，不需要为了“看起来像深模块”再制造公开 interface。

源码归属的事实源是 `scripts/arch/source-code-analysis/declarations.ts`。受治理的源码文件必须由声明解析为唯一的 `module + role`：

- 没有归属、多重归属、模块声明的 interface 路径不存在或出现模块级依赖循环，`gate:domain` 直接失败。
- 默认使用集中式路径声明，而不是在每个文件写可漂移的注释标签；只有路径无法稳定表达所有权时，才收窄或增加显式声明规则。
- 自动生成源码和 `apps/*` 部署镜像不进入人工源码统计，避免重复或生成噪声淹没真实实现。
- snapshot 统计非空、非纯注释源码行，并解析跨模块 import 与模块级循环；这些数字是诊断证据，不是 depth score。
- 管理矩阵的全部代码体量统一使用“万行”：零值显示 `—`，1–999 行显示 `<0.1`，1000 行及以上保留两位小数，例如 `0.12 / 1.12 / 5.23`；文件数和依赖数必须明确作为数量展示，不能与代码行混用。两位小数采用只影响显示的守恒舍入：原始整数行数不变，表内分配 0.01 万行的舍入尾差，使每一行的总代码等于右侧职责之和，末行每列等于上方模块之和，且末行总代码同时等于末行职责之和；`<0.1` 是区间提示，不参与肉眼小数加总。
- snapshot 继续保存全部原始 role，治理、门禁和下钻不得消费合并后的展示值。管理矩阵默认按职责相近度聚合为：`UI`；`边界 = 输入 + 领域校验 + 契约`；`业务`；`数据访问`；`其他 = 外部集成 + 组合壳 + 模块测试 + 工程实现`。可展开的聚合列在列头声明下钻动作：点击保留聚合列并在其右侧展开原始 role，同一时间只展开一组，再次点击收起。因此默认矩阵保持紧凑，同时任一聚合列都与其明细严格同口径、无遗漏。小项只在展示层进入“其他”，不得修改源码归属或后端统计口径。
- 每个文件只计入一个主要 role；同时执行“单文件单职责”硬门禁。高置信度跨界包括：输入解析同文件直连 Prisma、domain validator 同文件读取或写入 Prisma、集成 adapter 同文件声明输入 schema 并实现传输、React UI 同文件声明 Zod 输入或直接挂第三方 SDK。命中项必须拆到模块私有的 `*-input`、`*-reference-adapter`、transport adapter 或 UI host，`source-code-analysis:check` 要求未解耦项为零。
- application service 可以在同一事务内组合授权后的 command、持久化、审计和幂等，因为这是一个原子 use case；不要为了消除词法信号增加透传 repository。纯规则、输入 schema、DTO 映射或第三方 SDK 生命周期若可独立变化，仍须移出 service。`policy`、`workflow`、`service` 或目录名本身不构成混合证据，type-only Prisma import 也不算数据访问。
- 现有 package boundary gate 继续作为非法依赖的权威门禁。一个候选细粒度模块若与外部形成循环，应先移动 seam、合并错误边界或完成解耦，不能只靠声明把它包装成“模块”。

运行入口：

```bash
npm run source-code-analysis:check
npm run source-code-analysis:snapshot
npm run source-code-analysis:report
```

`npm run dev` 和 production build 会自动写入 `.cache/source-code-analysis/snapshot.json`；Full 与独立 deploy-unit artifact 会把同一 snapshot 放到运行入口旁。管理后台 `/settings/admin` 的“模块管理”右栏只读取该不可变 snapshot，不在请求时扫描生产文件系统。

快照生命周期必须 **fail-open**：生成、复制或读取失败，只允许让右栏显示“源码分析暂不可用”，不得阻断 dev、业务 build、deploy、运行时请求或左侧模块管理。严格失败只属于显式执行的 `source-code-analysis:check`（以及包含它的 `gate:domain`）；声明遗漏、循环依赖和未解耦混合职责都会失败。业务代码不得依赖 snapshot 才能工作。

## 8. 与现有 Workspace 规则的关系

- Core Surface contract 负责稳定的人类 interface；业务包声明业务字段、意图、候选和回调，不声明 renderer、布局机制或内部状态机。
- `A Core 源头层 -> B 薄壳 ViewModel -> C 渲染` 中，ViewModel 只适配业务事实，不得把后端完整生命周期转抄成 UI 选项。
- API route 仍然只做认证、权限、Zod、构造 command、调用业务 action 和返回 DTO。
- 写入仍然遵守 `Zod schema -> domain validator -> service/Prisma`；本规范补充的是 interface 如何收窄，以及错误如何在 interface 处局部化。

具体 UI 入口和 Surface 复用见 `docs/engineering/reusable-components.md`；分层、API shell 和写入规则见 `docs/engineering/architecture-governance.md`。
