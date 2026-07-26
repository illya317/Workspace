# Core UI Internal

Internal contains Core-only implementation details.

Rules:

- Internal files may render UI and compose low-level components.
- Business packages and app routes must not import Internal files.
- Internal includes renderers, primitives, resolver logic, style tokens, and utilities.
- Public behavior should be exposed through Surface declarations, Helpers, or Services instead.

Current status: migration target. Existing renderer and primitive files still live in `packages/core/ui` and are exposed only through Surface/helper/service boundaries or Core-private imports.
