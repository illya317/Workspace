# Core UI Helpers

Helpers are declaration builders. Business packages may import helpers when they only create Surface declarations and do not render UI.

Rules:

- Helper functions return Surface specs or spec fragments.
- Helper functions do not render React nodes.
- Helper functions do not read business runtime facts, permissions, or platform state.
- Helper names should make the target declaration obvious, for example `createFormSection` or `createVisualizationSection`.

Current status: Surface section helpers live here. The root helper files are compatibility re-export shims while imports are migrated.
