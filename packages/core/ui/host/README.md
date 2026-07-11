# Core UI Host

Host is reserved for the small set of files that execute Surface declarations.

Rules:

- Host imports must be explicitly allowlisted before use.
- Business packages should not import Host APIs.
- Host should stay thin: receive Surface declarations, invoke Core renderers, and connect page-level runtime context.

Current status: intentionally empty. `arch:surface-boundaries` fails if registry exposes a `role=host` entry or if source files are added here without an explicit allowlist decision.
