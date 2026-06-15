# Record Template DOCX Cleanup Report

> 自动生成：`python3 scripts/clean_record_templates_from_docx_evidence.py --apply --report docs/coverage/audit/record_template_docx_cleanup_report.md`
> 报告不含时间戳；重复生成应保持稳定。

## Scope

- mode: apply
- evidence_source: `docs/coverage/audit/docx_detail_section_candidates.yaml`
- complete_candidates_in_source: 0
- pending_actions_from_current_state: 0
- top_level_needs_review_remaining: 0
- nested_conclusion_review_remaining: 0

## Idempotence Contract

- 只消费 `evidence_status: complete` 的 DOCX 证据。
- 对已存在但被截断的清场，仅在 DOCX 可提取到完整清单时回填。
- 对 `not_inferred`，只处理标准区间可解析的含量规则、或操作文本有明确关键词的方法。
- `--apply` 才修改 `config/record_templates/*.yaml`；默认 dry-run 不落盘。
- 只清除已由当前字段满足的 `review_reason`；方法推断、判定规则等非小节问题保留。
- DOCX inventory 已证实存在但 YAML 漏掉的检测项，只通过显式、可追踪的产品级规则补齐。
- 报告展示当前状态仍需处理的动作；`--apply` 成功后报告应稳定为 0 pending actions。
- 再次运行清洗脚本后不应产生 YAML diff。

## Pending Complete Candidates

| 模板 | 产品 | 阶段 | 检测项 | 原因 |
|------|------|------|--------|------|
| — | — | — | — | — |

## Pending Actions From Current State

| 模板 | 产品 | 阶段 | 检测项 | 动作 |
|------|------|------|--------|------|
| — | — | — | — | — |

## Remaining Top-Level Review Queue

| 模板 | 产品 | 阶段 | 检测项 | 剩余原因 |
|------|------|------|--------|----------|
| — | — | — | — | — |

## Acceptance Checks

- `python3 scripts/audit_docx_vs_mapping.py`
- `python3 scripts/audit_docx_detail_sections.py`
- `python3 scripts/clean_record_templates_from_docx_evidence.py --apply --report docs/coverage/audit/record_template_docx_cleanup_report.md`
- repeat the cleanup command and confirm no YAML diff
- `python3 -m py_compile app.py scripts/*.py src/pharma_ops/**/*.py`
- route smoke tests for affected products and `/methods/editor`
- `git diff --name-only -- config/methods test/fixtures/methods` must be empty
