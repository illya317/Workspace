# ERP 流程尽调模块架构

## 产品定位

该模块位于 `行政管理 → ERP流程尽调`，用于在大型 ERP 选型或实施之前，采集公司当前“销售到回款”流程的事实基线。它是跨销售、交付、仓储、财务、行政和 IT 的治理型入口，不是销售订单、应收或总账的正式业务单据引擎。

当前批次为 `order-to-cash-2026`。问卷内容以 `definitionVersion` 版本化；每位用户在同一批次中只有一份记录，可保存草稿、提交后继续补充并再次提交。

页面动作按阶段呈现：填报说明、流程材料和各业务章节只提供“保存草稿”；最终“问题与需求”页承担本轮检查和“提交当前版本”。保存与提交不会出现在同一动作区，避免用户误把阶段提交当作普通保存。

## 路由与组件

| 类型 | 路径 | 责任 |
|---|---|---|
| 页面 | `/administration/erp-diligence` | 鉴权、计算编辑/全量查看能力并挂载客户端页面 |
| API | `GET /api/modules/administration/erp-diligence` | 返回当前用户记录；有全量能力时同时返回全部记录 |
| API | `PUT /api/modules/administration/erp-diligence` | 保存当前登录用户在当前批次中的记录 |
| UI | `packages/administration/ui/erp-diligence` | 分章节填写、流程步骤、材料线索和汇总查看 |

## 权限与可见范围

- `administration.erpDiligence.entry/read/update` 控制页面进入、读取和保存。
- 普通用户即使具有页面读写权限，服务端也只查询和 upsert 自己的记录。
- `administration.erpDiligence.viewAll.read` 是独立显式能力；项目负责人获得该能力后可以查看当前批次全部记录。
- 全量能力不授予他人记录的代填或修改；V1 没有管理员代填接口。
- root admin 继续遵循平台统一的超级管理员判定。

权限由模块 registry、permission resource policy、API guard 和页面 capability 共同声明。新资源需要执行 `npm run db:seed:resources` 后，再由系统设置向具体用户或组织授权；代码不硬编码默认部门。

## 数据与写入链路

持久化模型为 `ErpDueDiligenceSubmission`：

- 关系与检索字段使用普通列：批次、版本、填报人、部门、岗位、主要环节、状态和提交时间。
- 问卷回答、流程步骤、材料线索使用 JSONB；服务端只接受当前 definition 中声明的问题 key，并对数组逐项校验。
- `campaignKey + respondentUserId` 唯一约束保证一个用户在一个批次只有一份记录。
- `version` 在每次更新时递增；`submittedAt` 记录当前版本最近一次提交时间。

写入严格经过：

```text
ErpDiligenceSaveSchema
  → buildErpDiligenceSaveCommand
  → administration.erpDiligence.save action adapter
  → commitErpDiligenceSaveCommand
  → Prisma upsert
```

填报人姓名和用户归属由服务端当前身份解析，客户端不能替换 respondent user。提交状态会额外要求部门、岗位、主要参与环节、至少一个流程步骤和最少五项业务回答；草稿允许不完整。

## 材料与后续边界

V1 只登记样表类型、存放位置和负责人，不上传合同、发票、银行流水等敏感原件。尽调完成后的 ERP 方案应从结构化事实中另行形成客户、报价、合同、订单、履约、开票、应收和核销的数据模型；不能直接把本问卷 JSON 当作正式交易数据。

状态：`workspace-owned`。
