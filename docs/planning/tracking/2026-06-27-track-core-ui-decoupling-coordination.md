# Core UI Decoupling Coordination

Status: active coordination note
Owner split: Architecture owns the model and gate; Hygiene owns historical debt cleanup.

## Current Decision

Do not continue the old "NavigationSurface + miscellaneous L2" direction. The current target model is:

1. Page: page skeleton and placement only.
2. Data: business data presentation contracts.
3. Form: business form/input contracts.
4. Common: shared interaction, display, input, selection, action, and chrome capabilities.
5. Feedback: feedback service and renderers.

The important correction is that Common is not one bucket. It must be split before more migration work continues:

| Common L2 | Owns |
|---|---|
| `common.chrome` | `Toolbar`, `TabBar`, `Pagination`, page header/breadcrumb style chrome |
| `common.action` | `ActionButton`, `CommandButton`, `ActionGlyph`, action ordering/specs |
| `common.input` | `InputControl`, text/date/time/file/switch/select field renderers |
| `common.selection` | `OptionPicker`, `SelectorPanel`, `SelectionGrid`, `FieldValueFilter`, FK/search selection |
| `common.display` | `Badge`, `NumberCell`, `AmountCell`, empty/metric/code display pieces |
| `common.overlay` | dropdown/floating/detail modal primitives |
| `common.foundation` | tokens, styles, class recipes, glyph taxonomy |

`Toolbar` and `TabBar` are chrome. They are not page layout entries and not domain surfaces. They are rendered by `PageSurface` or by Core-internal renderers, not by business pages directly.

## L2 Ownership Rule

Every L2 must belong to exactly one L1 family:

```txt
ownerL1: page | data | form | common | feedback
ownerL2:
  page.surface | page.blocks | page.frame | page.document |
  data.surface | data.table | data.record | data.metric | data.visual | data.cell |
  form.surface | form.field | form.layout | form.create | form.input-adapter |
  common.chrome | common.action | common.input | common.selection | common.display | common.overlay | common.foundation |
  feedback.service | feedback.renderer | feedback.compat
role: entry | contract | renderer | primitive | private
```

Rules:

- An L2 may not belong to another L1 or to a sibling L2.
- Common L2 must not import or depend on Page/Form/Data/Feedback domain L2.
- Page/Form/Data may depend on Common.
- Page may compose Form/Data at body block boundaries, but Page L2 may not depend on Form/Data internals.
- Form and Data should not depend on each other's L2 internals. Shared needs must move to Common.

## High-Coupling Signal

Treat an L2 as too coupled when any of these are true:

- A component is composed by two or more L1 surfaces and is not a pure style/token helper. Move it to `common.*`.
- A type appears in two or more L1 surface prop contracts. Move it to a Common contract.
- Two L2 groups depend on each other both ways. Extract a Common L2 or Common contract.
- One L2 imports three or more concrete renderers from a sibling L2, or more than roughly 25 percent of its dependency set is from that sibling.
- A business package directly imports Common renderers such as `Toolbar`, `TabBar`, `InputControl`, `Badge`, `SelectorPanel`, `NavigationSurface`, or `Pagination`. That is historical debt unless it is showcase/core-internal code.

## Page Rule Clarification

`PageSurface` owns page placement:

```txt
header
navigation
toolbar
body
footer
```

But L2 module navigation must not be shoved into `TabBar`. In the current module model:

- L1/L2 module entry lives in route/module shell or module cards.
- `TabBar` starts at the page's inner view level, effectively L3 and below.
- A URL should not show a TabBar full of sibling L2 modules such as all Finance modules.

## Work Split

Architecture owner:

- Define the final taxonomy: L1 family, L2 owner, role, and public-use fields.
- Update registry schema and registry validation.
- Decide which existing registry entries move to Page/Data/Form/Common/Feedback.
- Update Core UI docs once the model is stable.
- Own gate semantics for ownership and cross-L2 coupling.

Hygiene owner:

- Pause taxonomy, schema, registry-design, and PageSurface contract changes until Architecture lands the model.
- Do not expand baseline for new violations.
- Do not move components across families based on the old NavigationSurface/chrome model.
- Collect current historical debt by category:
  - business direct runtime imports of Core L2/L3 renderers,
  - embedded `PageSurface` owning toolbar/navigation,
  - `DataSurface.toolbar` / `FormSurface.toolbar` usage,
  - `PageSurface.moduleView` escape hatches,
  - direct `NavigationSurface` / `Toolbar` / `TabBar` / `Pagination` usage.
- Ratchet only when a migrated item is actually removed.
- If cleanup requires changing registry schema, gate logic, or Surface contracts, stop and hand back to Architecture.

## Temporary Freeze For Neighbor Agent

Please temporarily stop work on:

- renaming `NavigationSurface` into a new surface-like thing,
- changing L1/L2 meaning in registry,
- modifying `PageSurface` / `FormSurface` / `DataSurface` / `Toolbar` contracts for taxonomy reasons,
- adding new registry entries merely to satisfy gate,
- moving business pages to a new pattern before the Common L2 split is landed.

Allowed work for now:

- inventory debt,
- reduce obvious direct imports when the destination is already unambiguous,
- remove stale baseline entries after real cleanup,
- report any blocker where a business page needs a missing Common contract.

## Next Architecture Steps

1. Add ownership fields to `CoreUiComponentRegistration`.
2. Add validation: unique `ownerL1/ownerL2`, no Common-to-domain dependency, no sibling L2 circular dependency.
3. Reclassify current registry entries into Page/Data/Form/Common/Feedback.
4. Split public export policy into business public entry, contract types, and Core internal renderers.
5. Convert gate from old "L1/L2/L3 by accessLayer" wording to owner-aware checks.
