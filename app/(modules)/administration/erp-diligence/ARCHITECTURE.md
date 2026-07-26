# ERP 流程尽调模块架构

## 产品定位

该模块位于 `行政管理 → ERP流程尽调`，用于在大型 ERP 选型或实施之前，采集公司当前“销售到回款”流程的事实基线。它是跨销售、交付、仓储、财务、行政和 IT 的治理型入口，不是销售订单、应收或总账的正式业务单据引擎。

当前批次为 `order-to-cash-2026`。问卷内容以 `definitionVersion` 版本化，当前结构化诊断版为 V2；每位用户在同一批次中只有一份记录，可保存草稿、提交后继续补充并再次提交。

页面动作按阶段呈现：填报说明、流程材料和各业务章节只提供“保存草稿”；最终“问题与需求”页承担本轮检查和“提交当前版本”。保存与提交不会出现在同一动作区，避免用户误把阶段提交当作普通保存。

## 路由与组件

| 类型 | 路径 | 责任 |
|---|---|---|
| 页面 | `/administration/erp-diligence` | 鉴权、计算编辑/全量查看能力并挂载客户端页面 |
| API | `GET /api/modules/administration/erp-diligence` | 返回当前用户记录；有全量能力时同时返回全部记录 |
| API | `PUT /api/modules/administration/erp-diligence` | 保存当前登录用户在当前批次中的记录 |
| API | `POST /api/modules/administration/erp-diligence/attachments` | 为本人已保存的材料条目上传附件 |
| API | `GET /api/modules/administration/erp-diligence/attachments/:attachmentUid` | 本人或全量查看人下载受保护附件 |
| API | `DELETE /api/modules/administration/erp-diligence/attachments/:attachmentUid` | 删除本人上传到本人尽调表的附件 |
| UI | `packages/administration/ui/erp-diligence` | 分章节填写、流程步骤、材料线索和汇总查看 |

## 权限与可见范围

- `administration.erpDiligence.entry/read/update` 控制页面进入、读取和保存。
- 普通用户即使具有页面读写权限，服务端也只查询和 upsert 自己的记录。
- `administration.erpDiligence.viewAll.read` 是独立显式能力；项目负责人获得该能力后可以查看当前批次全部记录。
- 全量能力不授予他人记录的代填或修改；当前没有管理员代填接口。
- root admin 继续遵循平台统一的超级管理员判定。

权限由模块 registry、permission resource policy、API guard 和页面 capability 共同声明。新资源需要执行 `npm run db:seed:resources` 后，再由系统设置向具体用户或组织授权；代码不硬编码默认部门。

## 轻代码分析源

ERP 尽调 GET 同时服务经营分析的版本化 source registry，但不会新增一套“尽调分析权限”。以下 source 全部继承 `administration.erpDiligence.read`，执行时仍调用 `listErpDiligenceWorkspace`：普通用户只能分析自己的记录，具备 `viewAll.read` 的查看人保留原全量可见范围；部门和项目主页只标记为 `viewer` 口径，绝不把查看人可见数据伪装成目标部门或目标项目数据。

- `administration.erp-diligence.submissions`：一份填报一行，保留状态、定义版本、提交/更新时间、版本和完成度等全部公开标量。
- `administration.erp-diligence.answers`：动态答案规范化为 `path + valueKind + text/number/boolean`，多选保留数组下标。
- `administration.erp-diligence.process-steps` 与 `administration.erp-diligence.process-step-pain-points`：流程步骤和一对多痛点事实。
- `administration.erp-diligence.evidence-items` 与 `administration.erp-diligence.evidence-attachments`：材料要求及附件公开元数据；文件名、位置和校验值仍可按原权限分析，敏感级只作提示和导出策略。

附件下载响应和二进制内容永不进入轻代码；岗位/部门候选项和 `canViewAll` 权限结果属于页面控制面，也不作为经营事实。所有子源都执行硬行数、页数、字节和时间上限，超过上限显式失败，不静默截断。

## 数据与写入链路

持久化模型为 `ErpDueDiligenceSubmission` 和 `ErpDueDiligenceEvidenceAttachment`：

- 关系与检索字段使用普通列：批次、版本、填报人、所选员工岗位关系、部门、岗位、主要环节、状态和提交时间。
- 问卷回答、流程步骤、材料线索使用 JSONB；服务端只接受当前 definition 中声明的问题 key，并对数组逐项校验。
- `campaignKey + respondentUserId` 唯一约束保证一个用户在一个批次只有一份记录。
- `version` 在每次更新时递增；`submittedAt` 记录当前版本最近一次提交时间。
- 附件使用独立事实表保存文件名、类型、大小、SHA-256、上传人、时间和二进制内容，通过 `submissionId + evidenceKey` 绑定材料条目；附件元数据不接受客户端随问卷 JSON 回写。

写入严格经过：

```text
ErpDiligenceSaveSchema
  → buildErpDiligenceSaveCommand
  → administration.erpDiligence.save action adapter
  → commitErpDiligenceSaveCommand
  → Prisma upsert
```

填报人姓名和用户归属由服务端当前身份解析，客户端不能替换 respondent user。岗位候选只来自当前登录人有效的在职 `EmployeePosition` 关系；选择岗位后部门由该关系自动带入且不可手输，保存时服务端重新校验岗位归属，并把部门、岗位名称作为历史快照写入。流程责任岗位与材料负责人岗位只能选择该部门及其下级部门的现用岗位，客户端显示范围和服务端写入校验使用同一组织树口径。

上传附件前客户端先保存当前草稿，服务端再校验材料 key 确实属于当前登录人的当前批次记录。下载允许记录本人和具备 `viewAll.read` 的项目负责人；删除始终只允许记录本人。删除材料条目并保存时，其附件随之清理。

提交状态会额外要求当前岗位、主要参与环节、至少一个完整流程活动、每份材料的结构化属性，以及至少十项结构化现状判断；草稿允许不完整。

## V2 结构化诊断

- 业务章节不再以长文本回答为主。各流程主题统一选择“不适用、未知、线下、消息流转、表格、单点系统、集成系统、自动化”成熟度，汇总章节使用受控多选。
- 每个流程活动记录活动目录、责任岗位、频率、业务量、人工耗时、等待、执行方式、输入形态、规则复杂度、路径变化、例外与差错、交接、系统数量、日志、风险、复核要求和痛点。自由文本只保留给选项无法表达的例外说明。
- 数字化潜力和 Agent 潜力是从上述事实实时计算的派生结果，不写入数据库。规则固定、量大、重复、跨系统搬运的活动优先进入 ERP/工作流或确定性自动化；文档/消息输入、上下文判断、复杂规则和高例外活动才提高 Agent 潜力，高风险活动必须保留人工复核。
- 样表与材料记录类型、格式、更新频率、完整性、负责人岗位和位置，并可上传多份脱敏样表。支持 PDF、Office、CSV、文本和常用图片，单文件上限 20 MB、单材料上限 8 个、单份尽调表总量上限 100 MB。

方法口径参考 SAP Fit-to-Standard 的标准流程演示、配置问卷、差异与角色采集，Microsoft Dynamics 365 的业务流程目录与 fit-gap 分层，APQC PCF 的统一流程分类/指标语言，以及 Microsoft/UiPath 的流程挖掘和自动化可行性指标。Agent 评分再按 OpenAI 对复杂判断、难维护规则和非结构化数据的适用条件单独判断，不把所有自动化机会都归为 Agent。

## 材料与后续边界

附件用于上传脱敏样表、空白模板、台账样例和流程佐证；真实合同、发票、银行流水等高敏原件仍应留在原业务系统，通过存放位置或受控链接登记。尽调完成后的 ERP 方案应从结构化事实中另行形成客户、报价、合同、订单、履约、开票、应收和核销的数据模型；不能直接把本问卷 JSON 或附件当作正式交易数据。

状态：`workspace-owned`。
