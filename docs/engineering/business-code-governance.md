# Business Code Governance

业务编码由三层事实组成：Platform registry 登记“哪些后端字段需要编码”，模板定义“编号如何组成”，业务模块提供公司、组织、资产分类等运行时值。Settings 只提供统一维护界面，不复制对象清单，也不允许管理员新增编码对象。

## Canonical 模型

`packages/platform/business-code-registry.ts` 是编码对象、可用业务字段和系统 baseline 的唯一 registry。所有系统模板和自定义模板使用同一份 `BusinessCodeTemplateSettings`：

```txt
模板
└─ 规则分支（按优先级匹配）
   ├─ 适用条件（登记字段 + equals）
   ├─ 编码组成（固定文本 / 业务字段 / 日期时间 / 流水）
   └─ 流水设置（起始值 / 结束值 / 独立作用域）
```

- 系统模板是只读 baseline，但携带完整规则数据，可以复制为自定义模板。
- `+` 从空白规则开始，不选择“基础结构”；通过同一个创建 Interface 可以重建任意系统 baseline。
- 一个模板最多包含八条条件分支。条件只允许后端登记的枚举字段和 `equals`，同一分支内条件全部满足后才匹配。
- 不允许任意脚本、表达式或未知字段。字段转换只允许 registry 声明的大写字母、大写字母数字、去空格、正整数和补零。
- 流水作用域独立于显示段。字段可以只参与隔离计数而不显示在最终编号中；空作用域表示全局流水。

## 编码对象与 Adapter

编码对象仍由后端只读登记。`BusinessCodeObjectDefinition` 声明对象键、Owner、默认模板、真实实现入口和 Adapter；新增 registry 项后自动出现在对应模板的“关联编码对象”和生成文档中。

管理员可以在模板详情中添加兼容的编码对象，或把现有关系改绑到另一模板，但不能新增、删除或改写编码对象本身。候选模板不是按前端写死的模板类型过滤，而是由 Platform 尝试通过对象 Adapter 编译模板：只有能完整满足现有后端合同的模板才可选择。每条条件分支必须显示该分支的完整渲染示例，不能只给模板第一分支的总预览。

当前 Adapter 保持既有业务合同：

| Adapter | 既有合同 |
|---|---|
| sequential | 一条无条件规则，生成时间可参与日期和流水作用域 |
| organization | `G`、`M1`、`M2`、`M3` 四条条件分支；HR 继续负责简称、父级继承和改码级联 |
| position | 固定文本 + 直属组织编码 + 部门内流水 |
| project | 公司、部门、其他三条条件分支；继续使用既有项目号段和生成生命周期 |
| financeAsset | 公司 + 资产分类 + 账期年度 + 固定 5 位流水；作用域固定为这三个字段 |

Adapter 是 Platform 模板深模块和既有业务配置之间的 seam。模板 Module 的外部 Interface 只负责解析、预览、兼容性判断和编译；HR、Work、External、Finance 的业务校验、事务和生命周期不进入模板实现。

## 业务值与安全转换

模板只描述位置和结构，不接管主数据。`ELECTRONIC` 是资产分类编码的预览值，实际建卡仍使用所选分类的 `code`；`FUN` 是组织简称的预览值，实际简称和职能组织识别仍归 HR 业务数据。

日期格式严格区分大小写，允许 `YYYY`、`YY`、`MMM`、`MM`、`DD`；完整时间另允许 `HH`、`mm`、`ss`。未知标记、重复时间单位、缺少来源值或完整时间没有小时均 fail-closed。

## 保存、历史与分配

- 修改模板或编码绑定只影响之后的新建和尚未入库的导入，不追溯重算既有编号。
- 自定义模板修改后，Platform 会重新编译所有正在使用它的编码对象；任一对象不再兼容则拒绝保存。
- 被编码对象使用的自定义模板不能删除，必须先换绑。
- 预览不占号。最终编号必须在业务写入事务内分配，不得持久化客户端预览或使用 `max + 1` 替代原子流水。
- Finance 资产继续通过 `@workspace/platform/server/business-codes` 保存规则版本、幂等凭证、作用域、流水和最终编号；统一模板没有放宽 5 位、唯一性或事务合同。

## Docs 与 Gate

`npm run business-code:check` 同时执行 registry 与硬编码治理：

- 校验对象键、默认模板、实现入口和系统 baseline。
- 对每一个系统 baseline 执行统一解析、预览、兼容性判断和 `createBusinessCodeTemplate` 重建。
- 阻断 Settings 平行对象列表、模板“基础结构”选择和 `organizationFields` / `positionFields` / `projectFields` 等专用编辑器分支。
- 阻断独立“编码维护”视图，要求编码对象关系进入模板详情的“关联编码对象”，并使用统一 selection grid 卡片呈现。
- 要求统一编辑器同时声明规则分支、适用条件、编码组成、独立流水作用域和分支完整示例。
- 扫描未登记 `objectKey` 和 baseline 之外的新业务编码字面量或生成逻辑。
- 校验 `docs/generated/business-code-registry.md` 与 registry 一致。

普通功能开发不得扩大 `scripts/check/baselines/business-code-hardcoding.json`。新增编码对象必须先登记 registry 和真实实现入口，再由页面自动收录。
