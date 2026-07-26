import type { FormSurfaceSectionSpec } from "@workspace/core/ui";
import type { ExternalParty } from "@workspace/external/types";

export type ExternalPartyAvailabilityDraft = {
  kind: "schedule" | "correct" | "cancel-future";
  periodId: number | null;
  validFrom: string | null;
  validThrough: string | null;
  reason: string;
};

export function emptyExternalPartyAvailabilityDraft(): ExternalPartyAvailabilityDraft {
  return { kind: "schedule", periodId: null, validFrom: null, validThrough: null, reason: "" };
}

export function externalPartyAvailabilitySections(
  item: ExternalParty,
  draft: ExternalPartyAvailabilityDraft,
  onChange: <K extends keyof ExternalPartyAvailabilityDraft>(key: K, value: ExternalPartyAvailabilityDraft[K]) => void,
): FormSurfaceSectionSpec[] {
  const targets = item.availabilityTimeline.filter((period) => (
    period.authoritative && (draft.kind !== "cancel-future" || period.temporalState === "upcoming")
  ));
  const needsTarget = draft.kind !== "schedule";
  const needsPeriod = draft.kind !== "cancel-future";
  return [{
    kind: "section",
    key: "role-availability-command",
    title: "角色可用期间",
    layout: { columns: 2, density: "compact" },
    items: [{
      key: "availability-kind",
      label: "操作",
      required: true,
      spec: {
        valueType: "string",
        control: "choice",
        options: {
          source: "static",
          items: [
            { value: "schedule", label: "登记期间" },
            { value: "correct", label: "更正期间" },
            { value: "cancel-future", label: "取消待生效" },
          ],
          visibleCount: 3,
        },
      },
      value: draft.kind,
      onChange: (value) => onChange(
        "kind",
        value === "correct" ? "correct" : value === "cancel-future" ? "cancel-future" : "schedule",
      ),
    },
    ...(needsTarget ? [{
      key: "availability-period",
      label: "目标期间",
      required: true,
      spec: {
        valueType: "number" as const,
        control: "choice" as const,
        options: {
          source: "static" as const,
          items: targets.map((period) => ({
            value: period.id,
            label: `${period.validFrom || "未知"} 至 ${period.validThrough || "长期"}`,
          })),
          visibleCount: Math.min(Math.max(targets.length, 1), 6),
        },
      },
      value: draft.periodId,
      onChange: (value: unknown) => {
        const periodId = Number(value);
        const target = targets.find((period) => period.id === periodId);
        onChange("periodId", Number.isInteger(periodId) && periodId > 0 ? periodId : null);
        if (draft.kind === "correct" && target) {
          onChange("validFrom", target.validFrom);
          onChange("validThrough", target.validThrough);
        }
      },
    }] : []),
    ...(needsPeriod ? [{
      key: "availability-valid-from",
      label: "启用日",
      required: true,
      spec: { valueType: "date" as const, control: "temporal" as const, precision: "date" as const },
      value: draft.validFrom || "",
      onChange: (value: unknown) => onChange("validFrom", String(value || "") || null),
    }, {
      key: "availability-valid-through",
      label: "结束日",
      spec: { valueType: "date" as const, control: "temporal" as const, precision: "date" as const },
      value: draft.validThrough || "",
      onChange: (value: unknown) => onChange("validThrough", String(value || "") || null),
    }] : []),
    {
      key: "availability-reason",
      label: "原因",
      required: draft.kind !== "schedule",
      span: 2,
      spec: { valueType: "string", control: "text", multiline: true },
      value: draft.reason,
      onChange: (value) => onChange("reason", String(value || "")),
    }],
  }];
}
