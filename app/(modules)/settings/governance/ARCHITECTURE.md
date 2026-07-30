# Platform Governance Route Shell

- `/settings/governance` is the single Settings L2 for non-routine platform governance.
- `page.tsx` authenticates through `requireRouteAccess("/settings/governance")` and mounts `SettingsGovernancePage` from `@workspace/settings`.
- UI declarations, database relations, SQL settings, module management/source analysis, and operations records are same-page tabs; tab changes remain client state.
- The retired `/settings/ui` route and `settings.ui` resource are not compatibility aliases.
- Database-schema reads and module-management reads/writes use `/api/settings/governance/**`; both remain root-only in their route handlers, and module writes additionally require `settings.governance.configure` through the registry-derived API policy.
- SQL-settings reads use `/api/settings/governance/sql-settings`, remain root-only, and expose only an allowlisted live PostgreSQL configuration catalog. The UI is a read-only `3:7` master/detail workspace; database and host changes stay in the controlled operations workflow rather than granting the application runtime role administrative SQL privileges.
- Operations Records v1 is an explicit empty state. Production receipt files and local NDJSON are not read directly by the UI; later providers must add a server DTO and permission-scoped API under this L2.
