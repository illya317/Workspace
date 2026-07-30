# Platform Governance UI

`PlatformGovernanceClient` owns one same-page tab surface:

| Tab | Content | Access |
| --- | --- | --- |
| UI | Core UI declaration registry and capability details | `settings.governance` entry/read |
| 数据关系 | Current PostgreSQL tables, fields, PK/FK graph, and deletion rules | root only |
| SQL 设置 | Live PostgreSQL security and recovery configuration catalog | root only; read-only |
| 模块管理 | Module runtime enable/disable tree and build-time source analysis | root only; writes also use `configure` |
| 运维记录 | Governed operations-record surface | empty in v1; future reads use `audit` |

Tab selection is local client state and does not navigate or synchronize the URL. `UiComponentsShowcase` accepts the shared tabbar so the UI registry remains the original implementation rather than a copied view.

`SQL 设置` calls `/api/settings/governance/sql-settings` and uses the shared master/detail body with an exact desktop ratio of `3:7`. The left selector groups connection/authentication, query/lock, audit, and backup/recovery settings; the right side shows the live value, recommended boundary, source, activation context, restart state, and review status. The catalog reads only an explicit allowlist from `pg_settings` plus the current connection's safe TLS identity. Settings hidden from the least-privilege runtime role remain explicitly marked as unreadable; the page does not grant `pg_read_all_settings` or silently replace missing evidence with a guessed value. It never returns passwords, connection URLs, HBA contents, file paths, archive commands, or private keys. The page is intentionally read-only: PostgreSQL changes remain in the receipt-bound operations workflow, and the application runtime role is never elevated so the browser can edit host/database configuration.

Database relations call `/api/settings/governance/database-schema`. Module management calls `/api/settings/governance/modules`; its snapshot is generated during dev/build and the request never scans source code. Both route handlers retain the existing root restriction.

The Operations Records tab must not read deployment receipts, `.cache` files, server directories, or NDJSON from the browser. A future log source must define a server DTO, provenance, retention, filtering, and `settings.governance.audit` authorization before it can add records.
