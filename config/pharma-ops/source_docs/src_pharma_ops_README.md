# Pharma Ops Source Layout

This package is the home for production, QC, batch, record, and web-domain
logic. The root-level Flask entrypoint remains as a thin compatibility launcher
for the existing deployment workflow.

Suggested boundaries:

| Package | Purpose |
|---------|---------|
| `qc` | Quality-control workflows, methods, limits, and inspection logic |
| `batch` | Batch identity, lifecycle, and cross-module batch services |
| `production` | Manufacturing and production-record workflows |
| `records` | Record schemas, rendering contracts, and EAV field-key helpers |
| `md` | Markdown canonical quality checks and cleanup utilities |
| `docx` | Word document parsing, table fingerprints, and source extraction |
| `coverage` | Coverage audits, component mapping, and gap reports |
| `formulas` | Formula parsing, evaluation helpers, and validation |
| `shared` | Shared path, config, typing, and utility code |
| `web` | Flask app factory, blueprints, and route handlers |

For now, prefer adding new reusable modules here instead of adding more
top-level Python files. Move existing root modules only when a change already
touches them and the import path impact is small.
