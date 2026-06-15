# MD 清洗修复记录

## 2026-06-11

### S1 初筛

- `scripts/audit_md_quality.py` 识别 MD 清洗事故和 warning。
- 两个标题行混入正文问题已修复后，审计验证显示 `FIXED`。
- 阿奇霉素胶囊 3 个 `suspect_flattened_table` warning 已修复。

### S2 细筛

- 结构化建议见 `docs/coverage/md_cleanup_suggestions.yaml`。
- 这些修复均为结构复原，不新增业务内容，不补充无来源表格。

### S3 定点修复

- `盐酸特拉唑嗪 胶囊.md`：拆分中间体 `2.3 含量` 压平标题行。
- `硝酸异山梨酯片.md`：拆分成品 `2.2 鉴别` 压平标题行。
- `scripts/fix_md_flattened_table_rows.py --all`：全量修复 133 个压平细则/段落，并新增多列表格检测项标题识别；复跑 dry-run 为 0。

### S4 DOCX 证据补全

- `scripts/clean_md_canonical_from_docx_evidence.py --apply`：只消费 `docx_found: true` 的 MD gap candidates，补入 17 个可由 DOCX 结构文本证实的缺失细则块。
- 最终报告：`docs/coverage/audit/md_canonical_docx_cleanup_report.md`，当前 `pending_actions_from_current_state: 0`。
- `scripts/audit_coverage.py` 的细则预期已改为按当前产品、当前阶段、当前检测项的 `record_template` 生成，避免把一/二/三阶段同名检测项混用同一套要求。
- 泮托拉唑成品 `2.5/2.6` 复用待包装品计算过程，不再要求重复附件图谱；螺内酯微生物普通 `操作方法` 字段已移除并防止清洗脚本写回。
- 当前 `missing_detail_section` 为 0。

### 验证

```bash
python3 scripts/fix_md_flattened_table_rows.py --all --dry-run
# DRY-RUN: 0 fix(es)

python3 scripts/clean_md_canonical_from_docx_evidence.py --apply \
  --report docs/coverage/audit/md_canonical_docx_cleanup_report.md
# changed_actions: 0

python3 scripts/audit_md_quality.py
# 16/16 no_critical_md_cleanup_issue
# needs_manual_cleanup: 0

python3 scripts/audit_coverage.py
# no gaps

python3 scripts/audit_docx_detail_sections.py
# MD gaps: 0/0 with DOCX evidence
# YAML needs_review: 0/0 with DOCX evidence
```
