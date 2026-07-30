# Platform Governance UI

`PlatformGovernanceClient` owns one same-page tab surface:

| Tab | Content | Access |
| --- | --- | --- |
| UI | Core UI declaration registry and capability details | `settings.governance` entry/read |
| 数据关系 | Current PostgreSQL tables, fields, PK/FK graph, and deletion rules | root only |
| 模块管理 | Module runtime enable/disable tree and build-time source analysis | root only; writes also use `configure` |
| 运维记录 | Governed operations-record surface | empty in v1; future reads use `audit` |

Tab selection is local client state and does not navigate or synchronize the URL. `UiComponentsShowcase` accepts the shared tabbar so the UI registry remains the original implementation rather than a copied view.

Database relations call `/api/settings/governance/database-schema`. Module management calls `/api/settings/governance/modules`; its snapshot is generated during dev/build and the request never scans source code. Both route handlers retain the existing root restriction.

The Operations Records tab must not read deployment receipts, `.cache` files, server directories, or NDJSON from the browser. A future log source must define a server DTO, provenance, retention, filtering, and `settings.governance.audit` authorization before it can add records.
