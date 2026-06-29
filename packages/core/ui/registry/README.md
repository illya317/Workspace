# Core UI Registry

Registry describes Core UI entries, declaration fields, and composition relationships.

Rules:

- Registry records public Core UI entries and their declarative capability.
- Registry does not define business behavior.
- `/settings/ui` automatically shows entries with `declares`.
- `contract` is generated documentation detail and does not opt an entry into the UI library.
- `capabilities` describes non-declarative services and does not opt an entry into the UI library.
- Registry changes must stay in sync with docs and architecture gates.

Current categories for the UI library are derived in code: page layout, page content, and common.
