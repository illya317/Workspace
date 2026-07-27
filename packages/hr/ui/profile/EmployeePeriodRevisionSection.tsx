"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createFieldsSection,
  createPanelSection,
  type BodySurfaceSectionSpec,
  type FormSurfaceItemSpec,
  useFeedback,
} from "@workspace/core/ui";
import type { EmployeeProfile } from "@workspace/hr/types";
import { requestJson } from "@workspace/platform/ui/api-client";

type PeriodType = "Employment" | "EDP";

type PeriodTarget = {
  entityType: PeriodType;
  periodId: number;
  expectedVersion: number;
  label: string;
  startDate: string;
  endDate: string | null;
};

type PeriodRevisionDraft = PeriodTarget & { reason: string };

export function useEmployeePeriodRevisionSections({
  profile,
  canRevise,
  onSaved,
}: {
  profile: EmployeeProfile | null;
  canRevise: boolean;
  onSaved: () => Promise<void>;
}): BodySurfaceSectionSpec[] {
  const targets = useMemo(() => periodTargets(profile), [profile]);
  const [draft, setDraft] = useState<PeriodRevisionDraft | null>(() => toDraft(targets[0]));
  const [saving, setSaving] = useState(false);
  const feedback = useFeedback();

  useEffect(() => {
    setDraft(toDraft(targets[0]));
  }, [targets]);

  if (!canRevise || !draft) return [];
  const typeTargets = targets.filter((target) => target.entityType === draft.entityType);

  function selectType(entityType: PeriodType) {
    const target = targets.find((item) => item.entityType === entityType);
    setDraft(toDraft(target));
  }

  function selectTarget(periodId: number) {
    setDraft(toDraft(typeTargets.find((target) => target.periodId === periodId)));
  }

  async function save() {
    if (!profile || !draft) return;
    setSaving(true);
    try {
      await requestJson(`/api/modules/hr/roster/employee-profiles/${profile.employee.id}/period-revisions`, {
        method: "POST",
        body: JSON.stringify(draft),
        fallbackMessage: "周期修订失败",
      });
      feedback.success("周期修订已保存，原值和原因已进入历史记录");
      await onSaved();
    } catch (error) {
      feedback.error(error instanceof Error ? error.message : "周期修订失败");
    } finally {
      setSaving(false);
    }
  }

  const items: FormSurfaceItemSpec[] = [
    choiceItem("entityType", "周期类型", draft.entityType, periodTypes(targets), (value) => selectType(value as PeriodType)),
    choiceItem("periodId", "历史周期", String(draft.periodId), typeTargets.map((target) => ({ value: String(target.periodId), label: target.label })), (value) => selectTarget(Number(value))),
    dateItem("startDate", "开始日期", draft.startDate, true, (value) => setDraft((current) => current ? { ...current, startDate: String(value ?? "") } : current)),
    dateItem("endDate", "结束日期", draft.endDate, false, (value) => setDraft((current) => current ? { ...current, endDate: value ? String(value) : null } : current)),
    {
      key: "reason",
      label: "修订原因",
      required: true,
      spec: { valueType: "string", control: "text", multiline: true, state: "normal" },
      value: draft.reason,
      onChange: (value) => setDraft((current) => current ? { ...current, reason: String(value ?? "") } : current),
    },
  ];

  return [createPanelSection("period-revision", {
    sections: [createFieldsSection("period-revision-fields", items, {
      header: { title: "修订历史周期" },
      layout: { columns: 2 },
      actions: [{
        key: "save-period-revision",
        action: "save",
        label: saving ? "修订中..." : "确认修订",
        disabled: saving || !draft.startDate || !draft.reason.trim(),
        onClick: () => void save(),
      }],
    })],
  })];
}

function periodTargets(profile: EmployeeProfile | null): PeriodTarget[] {
  if (!profile) return [];
  return [
    ...profile.employments.flatMap((row) => row.id ? [{
      entityType: "Employment" as const,
      periodId: row.id,
      expectedVersion: row.version,
      label: `雇佣 #${row.id} · ${row.joinDate || "开始日期待补"} 至 ${row.leaveDate || "长期"}`,
      startDate: row.joinDate || "",
      endDate: row.leaveDate,
    }] : []),
    ...profile.edps.flatMap((row) => row.id ? [{
      entityType: "EDP" as const,
      periodId: row.id,
      expectedVersion: row.version,
      label: `${row.positionName || "未命名岗位"} · ${row.startDate || "开始日期待补"} 至 ${row.endDate || "长期"}`,
      startDate: row.startDate || "",
      endDate: row.endDate,
    }] : []),
  ];
}

function toDraft(target: PeriodTarget | undefined): PeriodRevisionDraft | null {
  return target ? { ...target, reason: "" } : null;
}

function periodTypes(targets: PeriodTarget[]) {
  return [
    ...(targets.some((target) => target.entityType === "Employment") ? [{ value: "Employment", label: "雇佣周期" }] : []),
    ...(targets.some((target) => target.entityType === "EDP") ? [{ value: "EDP", label: "任职周期" }] : []),
  ];
}

function choiceItem(
  key: string,
  label: string,
  value: string,
  options: Array<{ value: string; label: string }>,
  onChange: (value: string) => void,
): FormSurfaceItemSpec {
  return {
    key,
    label,
    spec: { valueType: "string", control: "choice", state: "normal", options: { source: "static", items: options, visibleCount: 8 } },
    value,
    onChange: (next) => onChange(String(next ?? "")),
  };
}

function dateItem(
  key: string,
  label: string,
  value: string | null,
  required: boolean,
  onChange: (value: unknown) => void,
): FormSurfaceItemSpec {
  return {
    key,
    label,
    required,
    spec: { valueType: "date", control: "temporal", precision: "date", state: "normal" },
    value,
    onChange,
  };
}
