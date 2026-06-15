# Script Boundaries

`scripts/*.py` are thin CLI wrappers; reusable logic lives under `src/pharma_ops/`.

## Daily Audit Gates

These are safe to run during normal development and should not mutate source data except for their own reproducible reports.

- `audit_business_readiness.py`
- `audit_template_contracts.py`
- `audit_tooling_boundaries.py`
- `audit_layout_templates.py`
- `audit_layout_template_blueprints.py`
- `audit_layout_template_review_matrix.py`
- `audit_runtime_acceptance.py`
- `audit_component_mapping.py`
- `audit_md_quality.py`
- `audit_coverage.py`
- `audit_template_coverage.py`
- `audit_docx_vs_mapping.py`
- `audit_docx_detail_sections.py`
- `audit_table_layouts.py`

## Layout Template Migration

These read legacy product layout JSON only as samples and candidates. They must not hand-maintain `config/table_layouts/products/**/*.json`.

- `generate_layout_template_consolidation.py`
- `generate_layout_template_blueprints.py`
- `generate_layout_template_review_matrix.py`
- `generate_manual_acceptance_pack.py`

## Evidence Repair Tools

These are not daily entrypoints. They default to dry-run, external drafts, or require explicit write flags before touching canonical MD/YAML.

- `md_to_record_template.py`: writes external drafts for existing templates; `--overwrite` is required to replace `config/record_templates/*.yaml`.
- `clean_md_canonical_from_docx_evidence.py`: default dry-run; `--apply` is required to write `schema/md_canonical/*.md`.
- `clean_record_templates_from_docx_evidence.py`: default dry-run; `--apply` is required to write YAML.
- `fix_md_flattened_table_rows.py`: default dry-run; `--apply` is required to write `schema/md_canonical/*.md`.
- `sync_missing_standards.py`: default dry-run; `--apply` is required to write `config/record_templates/*.yaml`.
- `generate_default_conclusions.py`: default dry-run; `--apply` is required to write `config/record_templates/*.yaml`.

## One-Off Analysis Helpers

These generate reports or development evidence for component/layout consolidation. Keep their outputs reviewed before using them to change runtime code.

- `align_component_fingerprint.py`
- `cluster_component_variants.py`
- `generate_table_previews.py`

## Runtime Maintenance

- `migrate_db.py`: migrates local/runtime SQLite schema. Do not run it against production-like data without a backup.
