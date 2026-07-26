import type { ReactNode } from "react";

import type {
  BodySurfaceBadgeSpec,
  BodySurfaceCommandSpec,
  BodySurfaceListItemSpec,
  BodySurfaceProps,
  BodySurfaceSectionBodyProps,
  BodySurfaceSectionSpec,
} from "@workspace/core/ui";
import {
  assertBusinessTemporalRegistration,
  businessTemporalViewKind,
  requireBusinessDate,
  type BusinessTemporalPosition,
  type BusinessTemporalRecordState,
  type BusinessTemporalRegistration,
  type BusinessTemporalViewKind,
} from "../contracts/business-temporal";

export interface BusinessTemporalViewItemSpec {
  key: string | number;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  validFrom?: string | null;
  validThrough?: string | null;
  temporalState: BusinessTemporalPosition;
  recordState: BusinessTemporalRecordState;
  actions?: BodySurfaceCommandSpec[];
  details?: BodySurfaceSectionSpec[];
}

export interface BusinessTemporalViewBaseSpec {
  registration: BusinessTemporalRegistration;
  asOfDate?: string;
  actions?: BodySurfaceCommandSpec[];
}

export type BusinessTemporalViewSpec =
  | (BusinessTemporalViewBaseSpec & {
      kind: "current-audit";
      current: BodySurfaceSectionBodyProps;
      auditAction?: BodySurfaceCommandSpec;
    })
  | (BusinessTemporalViewBaseSpec & {
      kind: "availability" | "effective-period";
      items: BusinessTemporalViewItemSpec[];
    })
  | (BusinessTemporalViewBaseSpec & {
      kind: "revision";
      current?: BusinessTemporalViewItemSpec;
      drafts?: BusinessTemporalViewItemSpec[];
      scheduled?: BusinessTemporalViewItemSpec[];
      history: BusinessTemporalViewItemSpec[];
    })
  | (BusinessTemporalViewBaseSpec & {
      kind: "event-ledger";
      projection: BodySurfaceSectionBodyProps;
      pending?: BusinessTemporalViewItemSpec[];
      events: BusinessTemporalViewItemSpec[];
    });

export interface BusinessTemporalViewResult {
  kind: BusinessTemporalViewKind;
  asOfDate?: string;
  body: BodySurfaceProps & { kind: "section"; sections: BodySurfaceSectionSpec[] };
}

const TEMPORAL_LABELS: Record<BusinessTemporalPosition, string> = {
  current: "当前",
  upcoming: "待生效",
  past: "历史",
  invalid: "日期异常",
};

const RECORD_STATE_LABELS: Record<BusinessTemporalRecordState, string> = {
  draft: "草稿",
  pending: "待确认",
  confirmed: "已确认",
  cancelled: "已取消",
  superseded: "已替代",
  reversed: "已冲正",
  voided: "已作废",
  unknown: "状态未知",
};

const TEMPORAL_TONES: Record<BusinessTemporalPosition, BodySurfaceBadgeSpec["tone"]> = {
  current: "success",
  upcoming: "info",
  past: "muted",
  invalid: "danger",
};

const RECORD_STATE_TONES: Record<BusinessTemporalRecordState, BodySurfaceBadgeSpec["tone"]> = {
  draft: "muted",
  pending: "warning",
  confirmed: "success",
  cancelled: "muted",
  superseded: "info",
  reversed: "danger",
  voided: "danger",
  unknown: "warning",
};

export function createBusinessTemporalView(
  spec: BusinessTemporalViewSpec,
): BusinessTemporalViewResult {
  assertBusinessTemporalRegistration(spec.registration);
  const expectedKind = businessTemporalViewKind(spec.registration.policy.storage);
  if (spec.kind !== expectedKind) {
    throw new Error(`Business Temporal view ${spec.kind} 与 registration ${spec.registration.key} 不匹配`);
  }
  const asOfDate = resolveAsOfDate(spec);
  let sections: BodySurfaceSectionSpec[];
  switch (spec.kind) {
    case "current-audit":
      sections = currentAuditSections(spec);
      break;
    case "availability":
    case "effective-period":
      sections = effectivePeriodSections(spec);
      break;
    case "revision":
      sections = revisionSections(spec);
      break;
    case "event-ledger":
      sections = eventLedgerSections(spec);
      break;
  }
  if (spec.actions?.length) sections.unshift(actionsSection("business-temporal-actions", spec.actions));
  return {
    kind: spec.kind,
    asOfDate,
    body: {
      kind: "section",
      sections,
      mobilePresentation: "drilldown",
    },
  };
}

function resolveAsOfDate(spec: BusinessTemporalViewSpec) {
  if (spec.registration.ui.asOf === "hidden") {
    if (spec.asOfDate) throw new Error(`Business Temporal view ${spec.registration.key} 不接受 asOfDate`);
    return undefined;
  }
  if (!spec.asOfDate) {
    if (spec.registration.ui.asOf === "required") {
      throw new Error(`Business Temporal view ${spec.registration.key} 必须提供服务端 asOfDate`);
    }
    return undefined;
  }
  return requireBusinessDate(spec.asOfDate, "截至日期");
}

function currentAuditSections(
  spec: Extract<BusinessTemporalViewSpec, { kind: "current-audit" }>,
) {
  const sections: BodySurfaceSectionSpec[] = [{
    key: "business-temporal-current",
    header: { title: "当前资料" },
    body: spec.current,
  }];
  if (spec.auditAction) {
    sections.push(actionsSection("business-temporal-audit", [spec.auditAction]));
  }
  return sections;
}

function effectivePeriodSections(
  spec: Extract<BusinessTemporalViewSpec, { kind: "availability" | "effective-period" }>,
): BodySurfaceSectionSpec[] {
  const groups: Array<[BusinessTemporalPosition, BusinessTemporalViewItemSpec[]]> = [
    ["current", spec.items.filter((item) => item.temporalState === "current")],
    ["upcoming", spec.items.filter((item) => item.temporalState === "upcoming")],
    ["past", spec.items.filter((item) => item.temporalState === "past")],
    ["invalid", spec.items.filter((item) => item.temporalState === "invalid")],
  ];
  const sections: BodySurfaceSectionSpec[] = [];
  for (const [state, items] of groups) {
    if (state === "upcoming" && !spec.registration.ui.upcoming) continue;
    if (state === "past" && !spec.registration.ui.history) continue;
    if (items.length === 0) continue;
    sections.push(itemListSection(`business-temporal-${state}`, TEMPORAL_LABELS[state], items, spec.registration));
  }
  return sections;
}

function revisionSections(spec: Extract<BusinessTemporalViewSpec, { kind: "revision" }>): BodySurfaceSectionSpec[] {
  const sections: BodySurfaceSectionSpec[] = [];
  if (spec.current) {
    sections.push(itemListSection("business-temporal-published", "当前发布版", [spec.current], spec.registration));
  }
  if (spec.drafts?.length) {
    sections.push(itemListSection("business-temporal-drafts", "草稿与待确认", spec.drafts, spec.registration));
  }
  if (spec.registration.ui.upcoming && spec.scheduled?.length) {
    sections.push(itemListSection("business-temporal-scheduled", "待生效版本", spec.scheduled, spec.registration));
  }
  if (spec.registration.ui.history && spec.history.length) {
    sections.push(itemListSection("business-temporal-revisions", "版本历史", spec.history, spec.registration));
  }
  return sections;
}

function eventLedgerSections(spec: Extract<BusinessTemporalViewSpec, { kind: "event-ledger" }>) {
  const sections: BodySurfaceSectionSpec[] = [{
    key: "business-temporal-projection",
    header: { title: "截至日期投影" },
    body: spec.projection,
  }];
  if (spec.registration.ui.upcoming && spec.pending?.length) {
    sections.push(itemListSection("business-temporal-pending-events", "待生效事件", spec.pending, spec.registration));
  }
  if (spec.registration.ui.history && spec.events.length) {
    sections.push(itemListSection("business-temporal-events", "事件台账", spec.events, spec.registration));
  }
  return sections;
}

function itemListSection(
  key: string,
  title: string,
  items: readonly BusinessTemporalViewItemSpec[],
  registration: BusinessTemporalRegistration,
) {
  return {
    key,
    header: { title },
    body: {
      kind: "section",
      list: {
        presentation: "list",
        items: items.map((item) => toListItem(item, registration)),
      },
    },
  } satisfies BodySurfaceSectionSpec;
}

function actionsSection(key: string, commands: BodySurfaceCommandSpec[]): BodySurfaceSectionSpec {
  return { key, body: { kind: "section", commands } };
}

function toListItem(
  item: BusinessTemporalViewItemSpec,
  registration: BusinessTemporalRegistration,
): BodySurfaceListItemSpec {
  const badges: BodySurfaceBadgeSpec[] = [{
    key: `temporal-${item.temporalState}`,
    label: TEMPORAL_LABELS[item.temporalState],
    tone: TEMPORAL_TONES[item.temporalState],
  }];
  if (registration.ui.recordState) {
    badges.push({
      key: `record-${item.recordState}`,
      label: RECORD_STATE_LABELS[item.recordState],
      tone: RECORD_STATE_TONES[item.recordState],
    });
  }
  return {
    key: item.key,
    title: item.title,
    description: item.description,
    meta: item.meta ?? periodLabel(item.validFrom, item.validThrough),
    badges,
    actions: item.actions,
    sections: item.details,
    tone: item.temporalState === "invalid" ? "danger" : item.temporalState === "upcoming" ? "info" : "default",
  };
}

function periodLabel(validFrom?: string | null, validThrough?: string | null) {
  if (!validFrom && !validThrough) return undefined;
  return `${validFrom || "未注明"} — ${validThrough || "长期"}`;
}
