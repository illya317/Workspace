# Core UI change request

Task: high-resolution export for diagram network visuals (organization chart PDF download clarity fix).

Authorized scope:

- Extract the diagram-path G6 graph options from `internal/visualization/VisualizationNetwork.tsx` into `internal/visualization/VisualizationNetworkDiagram.ts` without behavior change; the on-screen renderer keeps the same layout, styles, and behaviors.
- Add `internal/visualization/VisualizationNetworkExport.ts` with `renderVisualizationNetworkImage(visual, options)`, which re-renders a diagram `VisualizationNetworkSpec` offscreen at a higher `devicePixelRatio` and returns a PNG Blob for business-side download wrappers; map presentation is explicitly rejected.
- Public entry update: `packages/core/ui/index.ts` re-exports `renderVisualizationNetworkImage` and `VisualizationNetworkImageOptions`; registry entry added in `component-registry-data-page-api-n-z.ts`; `scripts/arch/structure-ui-core-imports.ts` lists the helper in `CORE_UI_NON_COMPONENT_EXPORTS` so business value imports stay legal.
- Business adoption is limited to `packages/hr/ui/organization/` (organization chart PDF download); other consumers are untouched.

Authorized follow-up (2026-08-07): restore pre-Ant visual density in the Core data-cell renderer after feedback on the permission matrix page:

- `internal/data/antd-data-cell.tsx`: cell actions with `presentation: "glyph"` and a tone use filled badge tone classes again (h-7 w-7 rounded-md), replacing the washed-out outlined button look so granted/implied/ungranted states are distinguishable; non-glyph action tones are unchanged.

Note: two companion changes to `internal/selection/antd-selection-tree.tsx` (card-style node titles, then legacy-density rows with tinted descendants and switcher alignment overrides) were both reverted the same day per user feedback — the density variant regressed expand performance. The tree file is back to its committed HEAD state; only the data-cell glyph tint restore above remains.
