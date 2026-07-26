import {
  createMessageSection,
  createPageDataSection,
  createSectionSection,
  type BodySurfaceSectionSpec,
  type DataSurfaceStructuredCellSpec,
} from "@workspace/core/ui";
import type { WorkOkrControlSettings } from "./types";
import type { WorkReportingSettings } from "./work-okr-settings-types";

const ENABLED_OPTIONS = [
  { value: "enabled", label: "启用" },
  { value: "disabled", label: "停用" },
];
const LATE_SUBMISSION_OPTIONS = [
  { value: "allowed", label: "允许补交" },
  { value: "blocked", label: "截止后关闭" },
];
const REPORTING_ROWS: Array<{ key: keyof WorkReportingSettings; label: string }> = [
  { key: "weekly", label: "周报" },
  { key: "monthly", label: "月报" },
];

export function createWorkReportingSettingsSection({
  settings,
  disabled,
  onChange,
}: {
  settings: WorkOkrControlSettings;
  disabled: boolean;
  onChange: (settings: WorkOkrControlSettings) => void;
}): BodySurfaceSectionSpec {
  const update = (key: keyof WorkReportingSettings, patch: Partial<WorkReportingSettings[typeof key]>) => {
    onChange({
      ...settings,
      reporting: {
        ...settings.reporting,
        [key]: { ...settings.reporting[key], ...patch },
      },
    });
  };
  const inputState = disabled ? "disabled" as const : "normal" as const;
  const rows: DataSurfaceStructuredCellSpec[][] = [
    ["汇报类型", "填报状态", "截止（周期结束后）", "逾期处理"].map((label) => ({
      content: { kind: "text", value: label },
      header: true,
      emphasis: "strong",
    })),
    ...REPORTING_ROWS.map(({ key, label }): DataSurfaceStructuredCellSpec[] => {
      const rule = settings.reporting[key];
      return [
        { content: { kind: "text", value: label, emphasis: "strong" } },
        {
          content: {
            kind: "input",
            spec: { valueType: "string", control: "choice", options: { source: "static", items: ENABLED_OPTIONS }, state: inputState },
            value: rule.enabled ? "enabled" : "disabled",
            onChange: (value) => update(key, { enabled: value !== "disabled" }),
          },
        },
        {
          content: {
            kind: "input",
            spec: { valueType: "number", control: "number", state: rule.enabled ? inputState : "disabled" },
            value: rule.submitDeadlineOffsetDays,
            onChange: (value) => update(key, { submitDeadlineOffsetDays: normalizeDeadlineOffset(value) }),
          },
        },
        {
          content: {
            kind: "input",
            spec: { valueType: "string", control: "choice", options: { source: "static", items: LATE_SUBMISSION_OPTIONS }, state: rule.enabled ? inputState : "disabled" },
            value: rule.allowLateSubmission ? "allowed" : "blocked",
            onChange: (value) => update(key, { allowLateSubmission: value !== "blocked" }),
          },
        },
      ];
    }),
  ];
  return createSectionSection("work-reporting-settings-section", {
    title: "工作汇报",
    sections: [
      createMessageSection("work-reporting-settings-boundary", {
        content: "周报和月报沿用同一套工作周期与目标数据，只配置是否填报、提交截止和逾期处理；汇报内容继续从计划、目标和关键结果自动汇总。停用后历史快照仍保留。",
        tone: "muted",
      }),
      createPageDataSection("work-reporting-settings", {
        kind: "structured",
        rows,
        mobile: { presentation: "list" },
        frame: "bordered",
        presentation: { density: "compact", header: "tinted" },
      }),
    ],
  });
}

function normalizeDeadlineOffset(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(0, Math.min(31, number)) : 0;
}
