import assert from "node:assert/strict";
import test from "node:test";

import type { BodySurfaceSectionBodyProps } from "@workspace/core/ui";
import { defineBusinessTemporalRegistration } from "../contracts/business-temporal";
import { createBusinessTemporalView } from "./business-temporal-view";

const emptyBody: BodySurfaceSectionBodyProps = { kind: "section", sections: [] };

const HR_EMPLOYEE_IDENTITY_TEMPORAL = defineBusinessTemporalRegistration({
  key: "example.current",
  ownerModuleKey: "example",
  resourceKey: "example.records",
  aggregate: "CurrentRecord",
  maturity: "partial",
  records: { authority: [{ kind: "model", model: "CurrentRecord", fields: ["id"], role: "anchor" }] },
  commands: ["change"],
  ui: { asOf: "hidden", upcoming: false, history: false, recordState: false, sourceNavigation: false },
  policy: { storage: "current", granularity: "instant", futureChanges: "forbid", sameDayChanges: "sequenced", overlaps: "forbid", gaps: "allow", correction: "audited-overwrite", deletion: "never" },
});

const HR_EMPLOYMENT_TEMPORAL = defineBusinessTemporalRegistration({
  key: "example.effective",
  ownerModuleKey: "example",
  resourceKey: "example.records",
  aggregate: "EffectiveRecord",
  maturity: "partial",
  records: { authority: [{ kind: "model", model: "EffectiveRecordVersion", fields: ["id", "validFrom"], role: "period" }] },
  commands: ["schedule", "correct"],
  ui: { asOf: "required", upcoming: true, history: true, recordState: true, sourceNavigation: false },
  policy: { storage: "effective-version", granularity: "date", futureChanges: "allow", sameDayChanges: "single", overlaps: "forbid", gaps: "allow", correction: "supersede", deletion: "end-date" },
});

const HR_POSITION_DESCRIPTION_TEMPORAL = defineBusinessTemporalRegistration({
  key: "example.revision",
  ownerModuleKey: "example",
  resourceKey: "example.records",
  aggregate: "RevisionRecord",
  maturity: "partial",
  records: { authority: [{ kind: "model", model: "RevisionRecord", fields: ["id", "revision"], role: "revision" }] },
  commands: ["publish", "supersede"],
  ui: { asOf: "optional", upcoming: true, history: true, recordState: true, sourceNavigation: false },
  policy: { storage: "revision", granularity: "date", futureChanges: "allow", sameDayChanges: "single", overlaps: "forbid", gaps: "allow", correction: "supersede", deletion: "draft-only" },
});

const CAPITAL_OWNERSHIP_LEDGER_TEMPORAL = defineBusinessTemporalRegistration({
  key: "example.event-projection",
  ownerModuleKey: "example",
  resourceKey: "example.records",
  aggregate: "EventRecord",
  maturity: "partial",
  records: { authority: [{ kind: "model", model: "ExampleEvent", fields: ["id", "sequence"], role: "event" }] },
  commands: ["append-event"],
  ui: { asOf: "required", upcoming: true, history: true, recordState: true, sourceNavigation: true },
  projection: { eventSource: "ExampleEvent", projection: "ExampleProjection", sourceEventField: "sourceEventId", generationField: "projectionGeneration", runModel: "ExampleProjectionRun", projectorKey: "example.projector", projectorVersion: 1, rebuildAdapterKey: "example.rebuild" },
  policy: { storage: "event-projection", granularity: "date", futureChanges: "allow", sameDayChanges: "sequenced", overlaps: "forbid", gaps: "allow", correction: "reverse", deletion: "never" },
});

const item = (key: string, temporalState: "current" | "upcoming" | "past" | "invalid", recordState: "confirmed" | "pending") => ({
  key,
  title: key,
  temporalState,
  recordState,
});

test("effective views keep current, upcoming, history and invalid periods separate", () => {
  const view = createBusinessTemporalView({
    kind: "effective-period",
    registration: HR_EMPLOYMENT_TEMPORAL,
    asOfDate: "2026-07-27",
    items: [
      item("history", "past", "confirmed"),
      item("future", "upcoming", "pending"),
      item("current", "current", "confirmed"),
      item("invalid", "invalid", "pending"),
    ],
  });
  assert.equal(view.asOfDate, "2026-07-27");
  assert.deepEqual(view.body.sections.map((section) => section.key), [
    "business-temporal-current",
    "business-temporal-upcoming",
    "business-temporal-past",
    "business-temporal-invalid",
  ]);
  const upcoming = view.body.sections[1].body;
  assert.equal(upcoming.kind, "section");
  assert.deepEqual(upcoming.list?.items[0].badges?.map((badge) => badge.key), [
    "temporal-upcoming",
    "record-pending",
  ]);
});

test("revision and event views keep published content and projection separate from ledgers", () => {
  const revision = createBusinessTemporalView({
    kind: "revision",
    registration: HR_POSITION_DESCRIPTION_TEMPORAL,
    asOfDate: "2026-07-27",
    current: item("published", "current", "confirmed"),
    drafts: [item("draft", "upcoming", "pending")],
    scheduled: [],
    history: [item("old", "past", "confirmed")],
  });
  assert.deepEqual(revision.body.sections.map((section) => section.key), [
    "business-temporal-published",
    "business-temporal-drafts",
    "business-temporal-revisions",
  ]);

  const event = createBusinessTemporalView({
    kind: "event-ledger",
    registration: CAPITAL_OWNERSHIP_LEDGER_TEMPORAL,
    asOfDate: "2026-07-27",
    projection: emptyBody,
    pending: [item("pending", "upcoming", "pending")],
    events: [item("event", "past", "confirmed")],
  });
  assert.deepEqual(event.body.sections.map((section) => section.key), [
    "business-temporal-projection",
    "business-temporal-pending-events",
    "business-temporal-events",
  ]);
});

test("view builder enforces the registration view and server business date", () => {
  assert.throws(() => createBusinessTemporalView({
    kind: "current-audit",
    registration: HR_EMPLOYEE_IDENTITY_TEMPORAL,
    asOfDate: "2026-07-27",
    current: emptyBody,
  }), /不接受 asOfDate/);
  assert.throws(() => createBusinessTemporalView({
    kind: "effective-period",
    registration: HR_EMPLOYMENT_TEMPORAL,
    items: [],
  }), /必须提供服务端 asOfDate/);
});
