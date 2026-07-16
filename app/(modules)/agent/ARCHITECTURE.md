# Agent Module Architecture

## Product boundary

- `/agent` is a restricted management center. Ordinary employees use the global page-toolbar assistant and do not need management-center entry.
- The L1 has exactly three L2 routes:
  - `/agent/config`: Agent profile, runtime binding, runtime-capability management, and the canonical writer for the global ceiling, focused capability RBAC, and runtime allowlists.
  - `/agent/usage`: employee adoption, run volume and real SDK Token usage.
  - `/agent/reports`: Workspace run reports grouped by session, plus explicit external-receipt gaps.
- Each L2 is one Core `PageSurface`; `PageSurface.tabbar` owns the internal L3 views. The app pages authenticate and preload only; Platform owns the read models and UI composition.

## Permission boundary

- `agent` is the visible management container with `agent.config`, `agent.usage`, and `agent.reports` children.
- `agent.assistant` is the headless capability for `/api/agent/**` and the toolbar. Keeping it outside the management resource tree prevents an ordinary `agent.assistant.read/submit` grant from exposing `/agent`; its owner is the personal account surface, while `runtimeParentKey=agent` still lets module disablement stop the runtime.
- `agent.source` separately owns profile-only Workspace source search and CNB PR proposals. Its owner is `agent.assistant`, so both requester and virtual actor need assistant entry plus explicit `agent.source.read/submit`; neither identity needs `agent.config.entry`. The profile-less personal assistant cannot use these tools even when source is granted.
- Plain management `read` exposes aggregate facts. `agent.usage.audit` is required for employee/session detail; `agent.reports.audit` is required for requester, result and error detail.
- `/agent/config` is the canonical user-facing Agent configuration surface. `agent.config.configure` can edit profile/runtime configuration, runtime capability allowlists, and the global Agent action ceiling, but it never creates organization RBAC grants.
- The focused authorization matrix only lists enabled capability resources registered with `runtimeParentKey=agent`. Its GET/PUT gateway requires `agent.config.read`; the service repeats that check and independently requires each selected resource's real `grant` authority. User, position, and department changes acquire stable authorization-domain and tuple locks, then recheck subjects, root exclusions, resources, `agent.config.read`, and target grant authority inside one transaction before any grant or ledger write; `agent.config.configure` never bypasses this boundary.

## Configuration write contract

- `PUT /api/modules/agent/config` is the canonical management write route and is guarded by `agent.config.configure`. `/api/agent/**` remains the headless assistant surface and is not a management write shortcut.
- `PUT /api/modules/agent/config/action-ceiling` is also configure-guarded and records non-restorable `AgentPermissionPolicy` history around the underlying `SystemConfig.agentAllowedActions` value. Settings no longer exposes this field in its API or UI.
- `GET/PUT /api/modules/agent/config/permission-grants` is a focused adapter over the shared permission-subject directory, action matrix, grant authorization, atomic mutation, and permission ledger; it is not a second RBAC implementation.
- The lock guarantee linearizes explicit permission mutations that use the shared grant setter, including ancestor and recursive capability-owner grant dependencies. Concurrent HR membership, implicit-admin facts, root/canLogin changes, module enablement, seed code, direct SQL, and upstream `preauthorizedActor` business authorization do not participate in that advisory-lock protocol and remain explicit residual concurrency boundaries.
- After a ceiling or focused grant mutation, the client reloads `GET /api/modules/agent/config` so runtime capability candidates and `configurationValid` immediately reflect the new policy intersection instead of retaining a stale catalog.
- The route follows `Zod request -> pure domain validator -> service/Prisma transaction`. A command may update editable `AgentProfile` copy and/or exactly one existing `AgentRuntimeBinding`; actor identity, Profile key and runtime kind are immutable.
- Workspace allowlists are a subset of system-registered delegated tools that the virtual actor can use under the global action ceiling. Configuration discovery checks the virtual actor without requiring a pre-existing profile allowlist; every real turn still intersects the saved allowlist with requester and actor permissions again. Toolbar profile discovery hides profiles that currently have no usable registered tool for that requester. External runtime keys have strict stable-key syntax and are normalized and deduplicated.
- The service updates `editedBy`/`updatedAt` and records non-restorable before/after `EditHistory` snapshots for both `AgentProfile` and `AgentRuntimeBinding`. Runtime association is rechecked inside the transaction before any write.

## Identity and runtime facts

- Employee, employment, department, and position facts remain owned by HR. `AgentProfile` binds one non-login actor identity and descriptive responsibilities.
- `AgentRuntimeBinding` independently owns execution location, interactivity, status, instructions and capability keys. `active` means configured/enabled, not online.
- Workspace eligibility evaluates EDP, position and department lifecycle against one inclusive `Asia/Shanghai` business date. Each `AgentRun` stores the selected runtime binding and an immutable JSON/hash snapshot of runtime instructions and capabilities.
- Workspace, local Codex, CI and server operations are separate runtime kinds. Only an active interactive Workspace binding enters the page assistant. External bindings show `任务回执未接入` until a real receipt adapter exists; the UI never infers online state.

## Usage and report facts

- Kimi `StatusUpdate.token_usage` is cumulative within one model step. The runtime retains only the final update for each step, then sums steps into nullable `AgentRun` usage fields. Missing historical usage stays null rather than becoming zero.
- Kimi `context_usage` is a 0..1 proportion, stored as `contextUsagePeak`; it is not converted to Token.
- `AgentRun` is a model/runtime turn, not a business task. `AgentSession.summaryShort` is a compaction summary, not a canonical objective. The first report projection therefore groups Workspace runs by session and labels them as run reports without loading raw transcripts.
- Agent writes still require proposals and explicit human confirmation. Proposal confirmation refreshes requester and actor permissions, claims an execution lease and never automatically retries an uncertain external outcome. Only AI0004 receives the provisioned Workspace assistant/source grant set; AI0001-AI0003 remain external-runtime employees without Workspace source grants.
