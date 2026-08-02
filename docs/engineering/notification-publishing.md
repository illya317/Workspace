# Configurable notification publishing

This document defines the engineering contract for low-code notifications. It supplements the
compile-time notification registry; it does not replace workflow or business-action semantics.

## Product boundary

A configurable notification is a bounded plain-text message created from an administrator-published
definition. A general caller supplies only a definition key, an explicit bounded audience, template
variables, and an idempotency key. The caller cannot supply an actor, workflow payload,
resource/scope metadata, an absolute URL, JavaScript, HTML, SQL, a channel address, or a business
approval action.

The base publisher always supports the real `workspace` channel. The Work project-supervision
adapter may additionally select the managed `wecom` channel from a typed rule. It resolves only
Workspace users already bound to a WeCom userid and delivers a private Bot message; API callers
cannot provide a webhook, `chatid`, group target, provider credential, or arbitrary destination.
Email, Feishu, SMS and digest adapters remain unsupported until they have an equally durable
implementation.

## Deep module and seam

`packages/platform/server/notification-publishing.ts` owns the configured-notification seam. Its
Interface has three responsibilities:

1. configure a draft, publish an immutable revision, or archive a definition;
2. inspect definitions and publication receipts visible to a trusted principal;
3. accept a publication command and return a durable receipt.

HTTP routes are ingress adapters. Personal API requests retain the Workspace user identity and
normal RBAC. `/api/open/v1/**` requests retain the Open API Client identity and require both a
registered Scope and a definition-level Client allow-list. Neither adapter may implement template
rendering, audience resolution, idempotency, or Notification writes.

The existing `sendNotification(type, payload)` registry remains the Interface for code-owned domain
events. Business modules must not use configured publishing to bypass a typed registered event.

Project supervision is a consumer of this seam, not a second notification platform:

- Work owns `ProjectNotificationRule`, the condition allow-list, RASCI audience resolution and
  project-event/scheduled evaluation, durable signals and redrive governance;
- Platform owns definition rendering, idempotency, inbox projection, channel endpoints, the durable
  delivery outbox and delivery receipts;
- the existing Assistant WeCom sidecar owns the single SDK connection and performs claim/send/result
  work. It must not open a second Bot connection for notifications.

## Definition lifecycle

Definitions use a mutable head plus immutable revision snapshots:

- `revision` is the current editable head revision.
- each save uses expected-version compare-and-swap and appends one immutable revision;
- `publishedRevision` points to the only revision that may be used for new publications;
- publishing never rewrites a prior revision;
- saving after publication creates pending changes while the previous published revision remains
  active;
- archiving blocks new publications but never changes existing inbox snapshots or receipts.
- `key` is immutable after creation at both the service and database boundary; API callers must create
  a new definition when they need a different stable identifier.
- create, save, publish and archive each advance the head version and append one immutable
  `NotificationDefinitionLifecycleEvent` in the same transaction. The ledger stores only definition
  coordinates, action, actor and version transition; it never copies templates, Client grants,
  variables, credentials or provider addresses.
- `allowProjectMonitoring` defaults to false and is copied into each immutable definition revision;
  Work may discover or publish only a revision where that flag is true and whose variable set can be
  produced from the project snapshot allow-list.

The V1 template DSL is deliberately small: `{{flat_key}}` placeholders in a title, body, and optional
workspace-relative href. Placeholder keys are derived by the compiler, and a publication must supply
exactly that variable set. Titles, bodies, hrefs, variable values, variable count, audience size, and
Client grants are all bounded. Hrefs must start with one `/`, may not target `/api/**`, and render each
placeholder as a URL-encoded segment/value.

Low-code response modes are `read` and `acknowledge`. They never expose approve/reject or arbitrary
business callbacks. Code-owned notification action providers remain the only way to attach business
semantics to a notification.

## Publication invariants

A trusted ingress adapter constructs the source context; source fields never come from JSON input.
The publishing module then performs these steps:

1. normalize the audience and compute a canonical request fingerprint;
2. look up `(sourceKind, sourceId, idempotencyKey)`;
3. return the original receipt for the same fingerprint, or reject a conflicting replay;
4. load and pin the published definition revision;
5. enforce the source grant, rate and recipient caps;
6. validate the exact variables and render bounded plain text plus an internal href;
7. resolve every username to a login-enabled user and fail closed if any recipient is invalid;
8. in one database transaction, append the publication, create selected inbox projections, and append
   one delivery fact per recipient and selected channel;
9. leave WeCom delivery rows in the durable outbox, or record an explicit permanent failure when a
   recipient has no bound WeCom userid;
10. return the persisted receipt. A replay never creates another Notification or delivery row.

Project publication additionally supplies a commit guard. Platform evaluates that guard inside the
same source-scoped advisory-lock transaction, after idempotent replay lookup and before any new
publication row is created. A stale Work signal lease therefore cannot publish after another worker
has reclaimed or dead-lettered the signal.

No provider network call occurs inside the publication transaction. A WeCom worker claims rows with
`FOR UPDATE SKIP LOCKED`, receives a bounded lease, and posts an immutable result. Expired leases are
retried with bounded backoff; duplicate identical results replay, conflicting results return `409`.

Caller variables are not copied into `Notification.payloadJson`. The inbox projection contains only
safe definition/publication metadata, so configurable notifications cannot acquire workflow roles by
injecting `flowType`, `workflowRole`, or a reserved type prefix.

## Facts and projections

- `NotificationDefinition` is the editable definition head.
- `NotificationDefinitionRevision` is an immutable configuration snapshot.
- `NotificationDefinitionLifecycleEvent` is the append-only definition state-machine ledger. The
  service transaction appends the event with each committed head version; a unique
  `(definitionId, newVersion)` coordinate rejects duplicates, and a database trigger rejects updates
  or deletes.
- `NotificationPublication` is the source-scoped idempotency and audit fact.
- `NotificationDelivery` is the per-recipient, per-channel delivery state and message snapshot.
- `NotificationDeliveryAttempt` is an immutable asynchronous-provider attempt.
- `NotificationChannelEndpoint` records the managed channel binding and health heartbeat.
- `NotificationDeliveryWorkerRequest` stores short-lived worker request idempotency receipts without
  raw secrets or signatures.
- `Notification` remains the mutable inbox projection (read, acknowledgement, clear state).
- `ProjectNotificationRule` is a Work-owned mutable rule head;
  `ProjectNotificationRuleRevision` and `ProjectNotificationEvaluation` preserve its immutable
  revisions and evaluation ledger.
- `ProjectNotificationSignal` freezes the project event snapshot and eligible rule revisions before
  asynchronous evaluation.
- `ProjectNotificationPublicationIntent` freezes the exact definition, audience, variables, channels,
  fingerprint and idempotency key before Platform publication.
- `ProjectNotificationSignalRedriveEvent` is the append-only actor/reason/lineage fact for a manual
  dead-letter retry. Redrive ancestry is resolved to one bounded, cycle-checked root intent.

Publication and delivery facts preserve the source label, pinned revision, audience snapshot, counts,
status, timestamps, and projection reference. Secrets and raw caller variables are never stored.
Database triggers reject mutation of append-only revisions, lifecycle/evaluation/attempt/redrive
facts; they also freeze the identity and request-snapshot columns of mutable publications,
deliveries, intents and signals while permitting only their documented state-machine fields.

## Project durable evaluation and redrive

Project mutations with at least one published rule revision matching the signal kind append a signal
in the same business transaction; unrelated or empty rule sets are a no-op. A single active Work
scheduler claims one due signal at a time, renews its lease between rules and evaluates only unfinished
frozen rules in rule-id order. A request-time best-effort kick respects the same per-project oldest
unfinished signal order. Successful publication is exactly idempotent at Workspace storage; a process
crash or lost lease can replay the same intent but cannot create a second publication.

Transient provider/platform failures retry with bounded backoff. Source rate-limit deferrals wait for
the next rate window without consuming the terminal-attempt budget, so a valid high-fanout rule set
does not become dead-letter merely because earlier rules filled the one-minute quota. Permanent
rule-specific failures are isolated and recorded without preventing other rules from being evaluated.

When the terminal retry budget is exhausted, the signal and every unresolved root intent are failed
under the same source advisory lock. An authorized project manager may redrive only a failed signal,
using the current `attemptCount` as compare-and-swap and supplying a bounded reason. The child signal
reuses the frozen project snapshot, only includes rules that were not already committed, and records
an immutable lineage event. Repeated redrives follow the root intent, so they never resend an already
committed publication. Queue health exposes only actionable failed leaves; a source failure that
already has a redrive child remains in the audit ledger but no longer stays in the active failure list.

The audience lookup uses the signal `occurredAt` date against project membership and employment
effective dates. The signal freezes project facts and eligible rule revisions, but membership rows are
temporal operational records rather than an immutable role-history ledger; a later authorized
correction to those dates or roles can change the audience of a subsequent redrive.

## Authorization

Internal business endpoints use `settings.notifications`:

- `read`: inspect published definitions;
- `configure`: save, publish, and archive definitions;
- `create` plus `apiUse`: accept a personal/Agent API publication;
- `audit`: inspect publication facts and aggregate delivery outcomes. Per-recipient delivery facts remain
  durable storage records in V1; the console does not expose their identity-level detail.

All actions are explicit-only. `settings.account.read` and `settings.api.read` do not imply publishing.
Open API authorization is separate: a Client needs the registered definition-read or publication-write
Scope and must also be present in the published definition revision's allow-list.

Project rule APIs require both Work project-object authorization and the explicit
`settings.notifications` capability: `read` for discovery/preview, `configure` for rule lifecycle,
and `audit` for the evaluation ledger. A personal API key does not bypass either check.

## API contract

Both ingress styles expose the same definition and publication shape:

- personal/session API: `GET /api/modules/settings/notifications/definitions` and
  `POST /api/modules/settings/notifications/publications`; a personal API key uses `x-api-key`;
- external Client API: `GET /api/open/v1/notifications/definitions` and
  `POST /api/open/v1/notifications/publications`; a Client secret uses `Authorization: Bearer`.

Every publication request must include an `Idempotency-Key` header. The JSON body is strict:

```json
{
  "definitionKey": "custom.operations.reminder",
  "usernames": ["username"],
  "variables": {
    "project_name": "年度预算"
  }
}
```

A first commit returns `201`; an identical replay returns the original receipt with `200` and
`replayed: true`. Reusing the same key for a different canonical request returns `409`. The
definition-discovery response declares the pinned revision, exact variable keys, response mode and
importance so callers can validate their payload without learning draft content.

Project notification conditions are managed through the normal authenticated Work API:

- `GET/POST /api/modules/work/projects/:projectId/notification-rules`
- `PUT /api/modules/work/projects/:projectId/notification-rules/:ruleId`
- `POST .../:ruleId/preview`, `POST .../:ruleId/publish`, `POST .../:ruleId/archive`
- `GET .../:ruleId/evaluations`
- `POST /api/modules/work/projects/:projectId/notification-signals/redrive`

The condition body is a strict AST of `all` / `any` / `not` groups and allow-listed scalar, set,
presence and relative-date predicates. It has bounded depth, predicate count and value sizes and
cannot contain JavaScript, SQL, regex, arbitrary object paths, or provider addresses. Writes use the
rule `version` for compare-and-swap. Redrive writes use the failed signal `attemptCount` for
compare-and-swap and require an operator reason.

## WeCom worker contract

The Assistant sidecar calls only HMAC-authenticated internal endpoints under
`/api/integrations/wecom/notifications/**`. `WECOM_WORKER_BRIDGE_SECRET` is independent from the Bot
SDK secret and every signature binds timestamp, request id, method, pathname and raw body. Claim,
result and heartbeat bodies carry a stable `workerId`; request ids are persisted for idempotent replay.

Publishing a project rule that selects WeCom fails closed unless the bridge secret is configured and
the managed `wecom.primary` endpoint has a recent healthy heartbeat. An already-published rule may
continue producing durable pending rows during a temporary provider outage; recovery is handled by
the same worker and receipt ledger.

`WECHAT_REDIRECT_ORIGIN` is optional when `WORKSPACE_PUBLIC_ORIGIN` is configured. The sidecar selects
the former first, otherwise derives only the safe HTTP(S) origin from the latter; credentials, query
and fragment are rejected, while deployment base paths remain controlled by
`NEXT_PUBLIC_BASE_PATH`.

The Bot runs as an Assistant deploy-unit sidecar only for the committed active slot. Fallback keeps
the monolith Bot definition inactive and recoverable. Deployment fails before handoff when the
independent bridge secret is missing/short, Gateway ownership is ambiguous, or the runtime descriptor
drifts. The Bot process receives an explicit environment allow-list and must not receive database,
NextAuth, OnlyOffice or control-plane credentials.

Delivery is system-level at-least-once, not provider-level exactly-once. If the provider accepted a
message but the process crashes before the durable result receipt, the expired delivery lease may
send again. When only the result HTTP response is lost while the worker remains alive, it retries the
same frozen result request and does not call the provider a second time.

## User experience

The “通知定义” tab on `/settings/api` is the low-code definition desk. It keeps the definition list, draft form,
live placeholder preview, allowed Clients, project-supervision opt-in, lifecycle actions, API example,
the recent definition lifecycle ledger, channel health and publication/delivery facts together. The
lifecycle audit DTO exposes only stable definition labels/keys, revision/version coordinates, action,
actor identity and time. The inbox always displays the source and recipient reason for configured
notifications.
Mobile master/detail pages must pass the Core `mobile.detailActive/onNavigateToList` contract rather
than relying on desktop split behavior.

The adjacent “企业微信群” tab is the group-delivery governance desk: a Bot-observed group first
appears as unclaimed, then an administrator assigns its stable `groupKey`, display name and owner and
verifies recent Bot presence. Per-group policies bind a published definition, governed data scope,
manual or weekly schedule, optional fixed `work.weekly-report` Agent adapter, enablement and recent
delivery/failure evidence. UI and Agent inputs never expose or accept provider conversation IDs,
raw `chatId` values or webhooks; only active + verified groups with enabled policies may enqueue.

The project detail page owns the “通知监管” tab. It presents rule draft/publish/archive lifecycle,
guided conditions, RASCI recipients, Workspace/WeCom channel policy, cooldown, preview and the
immutable evaluation ledger. It also exposes queue totals, recent safe failure summaries and an
audited redrive action. It does not expose global Client grants or provider credentials.

`/settings/account?tab=subscriptions` must include published configured definitions alongside code-
registered types. Configured publications have an assigned mandatory audience: recipients cannot
unsubscribe from a message that an authorized publisher explicitly directed to them.
