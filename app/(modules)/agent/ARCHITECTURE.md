# Agent L1

`app/(modules)/agent` is the Next.js route shell for the normal Agent L1.

- `/agent` authenticates and mounts `@workspace/agent/ui`.
- Agent conversation UI, runtime, proposal handling, connectors, and external bridges belong in `packages/agent`.
- Shared authentication, RBAC, signed delegation, tenant configuration, and business API contracts belong in `packages/platform`.
- Agent must not import another L1 package. Business reads and mutations go through registered protected APIs and confirmation proposals.
- The canonical `agent` resource protects the L1 conversation surface, toolbar assistant and `/api/agent/**`; there is no duplicate assistant capability resource.
