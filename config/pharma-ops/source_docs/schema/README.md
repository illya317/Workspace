# Schema 目录说明

`schema/` 现在只承载 MD 主线和少量历史兼容文件。旧的 JSON 四步管线已经归档，不再作为新开发输入。

## 当前主线

```text
raw/*.docx
  -> schema/md_extracted/*.md
  -> schema/md_canonical/*.md
  -> docs/coverage/audit/md_quality_report.md
  -> docs/coverage/audit/gaps.yaml
  -> config/products.yaml + config/record_templates/*.yaml
```

## 目录职责

| 路径 | 职责 |
|------|------|
| `md_extracted/` | MD 抽取稿，作为 Phase -1 重建输入 |
| `md_canonical/` | 清洗真源稿，覆盖审计和模板生成只读这里 |
| `template_headings.md` | 批检验记录整体标题骨架 |

旧 `schema/rules/` 与后续迁入的 S0/S1/S2/docx 规则均已归档；当前 MD/YAML 主线不再读取规则目录。

## 当前脚本

| 脚本 | 阶段 | 说明 |
|------|------|------|
| `scripts/audit_md_quality.py` | Phase -1 | 扫描 `md_canonical`，输出 MD 清洗质量报告 |
| `scripts/fix_md_flattened_table_rows.py` | Phase -1 | 幂等修复被压入表格行的 MD 正文/细则块 |
| `scripts/revise_md_microbiology_precheck.py` | Phase -1 | 幂等修订微生物空“检验前确认”小节，保留原文编号 |
| `scripts/audit_coverage.py` | Phase 0 | 生成 16 产品覆盖矩阵和缺口报告 |

## MD 清洗闭环

Phase -1 使用三步闭环：

1. S1 初筛：`scripts/audit_md_quality.py` 发现清洗事故。
2. S2 细筛：`docs/coverage/md_cleanup_suggestions.yaml` 记录结构化修复建议。
3. S3 定点修复：只修 S1/S2 标出的异常块，并记录到 `docs/coverage/md_cleanup_changelog.md`。

## 已归档内容

旧 `schema/s1_raw`、`schema/s2_agent`、`schema/s3_tbc`、`schema/s4_confirmed` 已归档到：

```text
archive/schema_legacy/20260611/
```

旧 docx→json→editor→confirmed 管线脚本已归档到：

```text
archive/scripts_legacy/20260611/
```

需要追溯旧字段抽取结果时，只读归档目录，不要把它们重新作为主线输入。

## 验收命令

```bash
python3 scripts/audit_md_quality.py
python3 scripts/audit_coverage.py
```

Phase -1 通过标准：16 个 MD 都 `catalog_ok=true` 且 `template_ok=true`。

Phase 0 通过标准：覆盖矩阵和 `gaps.yaml` 能准确列出产品、阶段、检测项、缺模板、缺映射、缺细则块等问题。
