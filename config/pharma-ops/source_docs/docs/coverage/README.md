# docs/coverage/

| 目录 | 内容 | 来源 |
|------|------|------|
| `audit/` | 页面和计划需要读取的轻量检测报告 | `scripts/audit_*.py` 重跑刷新 |
| `manual/` | agent/人工撰写的总结和人工验收反馈 | 不要删 |

大型资料和可重建缓存不放在源码仓库里，默认放到：

`~/Desktop/workspace/.pharma-ops/docs/`

当前外置内容包括：

- `docs/coverage/audit/previews/`
- `docs/coverage/audit/pdf_previews/`

当前项目内保留但不进 Git 的可重建审计缓存包括：

- `docs/coverage/audit/docx_inventory.json`
- `docs/coverage/audit/table_fingerprint.json`

网页运行时目前会读取 `component_mapping.md`、`component_checklist.md`、
`manual/component_feedback.json` 和 `config/table_layouts/products/**/*.json`。这些轻量依赖
应保留在源码内。DOCX/PDF/PNG 预览属于资料或审计缓存，应保留在外置工作区。

Table layout 新方向：

- 旧 `config/table_layouts/products/**/*.json` 只作为归类/取样参考，不作为长期逐个维护目标。
- 长期入口迁往 `config/table_layouts/templates/{common,operation,weighing,measurement,calculation,microbiology,parents}/` 的“子模板 + 父模板 include”体系。
- `/api/table-layout/<key>` 已支持读取并展开 `templates/**` include；旧 product JSON 仍可直接返回，保证迁移期兼容。
- `scripts/generate_layout_template_consolidation.py` 当前输出模板合并候选归类报告，不写旧 product JSON。
- 不再保留逐个旧 JSON review queue/review UI 入口；不要手改 226 个 product JSON。
- `scripts/generate_layout_template_blueprints.py` 基于候选归类报告生成外置蓝图草稿，写到
  `~/Desktop/workspace/.pharma-ops/drafts/table_layout_templates/`；它不写正式模板目录。
- `scripts/generate_layout_template_review_matrix.py` 把 29 个候选组整理成 19 个父模板候选和人工抽样入口，用于你看图确认。
- 页面上的 table-layout 保存也只写外置 `~/Desktop/workspace/.pharma-ops/drafts/table_layout_editor/` 草稿；正式模板必须人工确认后再进入 `config/table_layouts/templates/`。

脚本边界见 `scripts/README.md`。会修改 canonical MD 或正式 YAML 的修复工具必须默认 dry-run、写外置 drafts，或要求显式
`--apply` / `--overwrite`；日常 Agent 工作优先跑审计和候选归类报告。

常用审计入口：

- `scripts/audit_business_readiness.py`：检查 YAML/MD 层面的业务准入风险。
- `scripts/audit_template_contracts.py`：检查 YAML 字段/公式/field_key 唯一性，以及 MD canonical 与产品映射一致性。
- `scripts/audit_tooling_boundaries.py`：检查旧 review queue、旧 product JSON 逐项维护入口、重复产品 catalog 和旧 schema/rules 目录没有回流。
- `scripts/audit_layout_templates.py`：检查 `config/table_layouts/templates/**/*.json` 的 include 引用、递归展开和运行时可渲染块。
- `scripts/audit_layout_template_blueprints.py`：检查外置候选蓝图 manifest、草稿路径、草稿 JSON 自描述和 0 正式模板写入边界。
- `scripts/audit_layout_template_review_matrix.py`：检查人工确认矩阵覆盖全部候选组、父模板候选和代表样本入口。
- `scripts/audit_runtime_acceptance.py`：检查 16 产品运行时结构 API、页面路由、layout API、字段 key、保存入口和别嘌醇链接泄漏。
- `scripts/generate_manual_acceptance_pack.py`：汇总 16 产品前端/业务双验收入口、代表检测项、抽查重点、旧 layout 样本数和自动 save/load 结果。
- `scripts/generate_layout_template_consolidation.py`：读取旧 224 个 product layout JSON，输出 29 个模板合并候选组、include 建议和样本入口。
- `scripts/generate_layout_template_blueprints.py`：把 29 个候选组转成外置候选蓝图和 `docs/coverage/manual/layout_template_blueprints.*`，用于人工看图确认前的模板迁移准备。
- `scripts/generate_layout_template_review_matrix.py`：把候选组聚合为父模板候选矩阵、人工确认优先级和抽样记录入口。
- `scripts/audit_component_mapping.py`：刷新组件映射和组件 checklist。
