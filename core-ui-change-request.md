# Core UI change request

Task: Ant Design migration of the Core Surface general-purpose renderers (`.planning/2026-08-03-hr-antd-pilot`).

Authorized scope:

- Ant implementations beside each owning Core capability: `internal/page`, `internal/body`, `internal/data`, `internal/input`, `internal/form`, `internal/toolbar`, `internal/selection`, `internal/create`, reviewed common controls, and `services/ui-provider`.
- `PageSurface`, `InputSurface`, `Toolbar`, and `SelectorSurface` use Ant implementations by default, with every temporary unsupported capability explicitly delegated according to the contract matrix.
- Phase 6d/6e may complete `FormSurface` and `CreateSurface` within the same task; Phase 7 may remove legacy general-purpose renderers only after the zero-delegation gate passes.
- Contract-facing `*.types.ts` remain frozen unless a separately reviewed capability gap requires a contract change; silent property loss is forbidden.
- Public registry update: `UiProvider`; generated contracts are refreshed from the formal Mac baseline during integration.
