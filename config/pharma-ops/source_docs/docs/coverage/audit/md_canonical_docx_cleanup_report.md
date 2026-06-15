# MD Canonical DOCX Cleanup Report

> 自动生成：`python3 scripts/clean_md_canonical_from_docx_evidence.py --apply --report docs/coverage/audit/md_canonical_docx_cleanup_report.md`
> 报告不含时间戳；重复生成应保持稳定。

## Scope

- mode: apply
- evidence_source: `docs/coverage/audit/docx_detail_section_candidates.yaml`
- docx_found_md_gap_candidates: 0
- docx_missing_md_gap_candidates: 0
- pending_actions_from_current_state: 0

## Idempotence Contract

- 只消费 `md_gap_candidates` 中 `docx_found: true` 的证据。
- 只在对应 `###` 检测项块中插入缺失的 `####` 小节。
- 不为 DOCX 找不到证据的 gap 造内容。
- `--apply` 才修改 `schema/md_canonical/*.md`；默认 dry-run 不落盘。
- 报告展示当前状态仍需处理的动作；`--apply` 成功后报告应稳定为 0 pending actions。

## Pending Actions From Current State

| 文件 | 产品 | 阶段 | 检测项 | 小节 | 插入行 | 证据摘要 |
|------|------|------|--------|------|--------|----------|
| — | — | — | — | — | — | — |

## Acceptance Checks

- `python3 scripts/fix_md_flattened_table_rows.py --all --dry-run` should report 0 fixes.
- `python3 scripts/audit_md_quality.py` should report 0 critical MD cleanup issues.
- `python3 scripts/audit_coverage.py` should have no mapping/YAML extra gaps.
- `python3 scripts/audit_docx_detail_sections.py` should report no YAML needs_review queue.

