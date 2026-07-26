import type { SurfaceToolbarItems } from "@workspace/core/ui";
import type {
  ConsolidationBatchStatus,
  ConsolidationBatchVersionSummary,
} from "@workspace/finance/types";

import {
  consolidationPeriodLabel,
  consolidationPeriodValue,
  parseConsolidationPeriod,
  shiftConsolidationPeriod,
  type ConsolidationPeriodKind,
} from "./consolidation-period";

const BATCH_STATUS_LABELS: Record<ConsolidationBatchStatus, string> = {
  draft: "草稿",
  submitted: "待复核",
  reviewed: "已复核",
  locked: "已锁定",
  published: "已发布",
};

export interface StatementPeriodToolbarInput {
  year: number | null;
  month: number | null;
  periodKind: ConsolidationPeriodKind;
  loading: boolean;
  onPeriodKindChange: (kind: ConsolidationPeriodKind) => void;
  onPeriodChange: (year: number, month: number) => void;
}

export interface ConsolidationToolbarInput extends StatementPeriodToolbarInput {
  error: string | null;
  batchId: number | null;
  batchVersions: ConsolidationBatchVersionSummary[];
  onBatchChange: (batchId: number) => void;
  onRefresh: () => void;
  createVersion: {
    nextVersion: number;
    busy: boolean;
    onClick: () => void;
  } | null;
}

export function buildStatementPeriodToolbarItems(input: StatementPeriodToolbarInput): SurfaceToolbarItems {
  const periodValue = input.year === null || input.month === null
    ? null
    : consolidationPeriodValue(input.year, input.month, input.periodKind);
  const changePeriod = (year: number, month: number) => input.onPeriodChange(year, month);

  return [
    {
      kind: "option-group",
      key: "period-kind",
      value: input.periodKind,
      options: [
        { value: "year", label: "年" },
        { value: "quarter", label: "季度" },
        { value: "month", label: "月" },
      ],
      onChange: (value) => {
        const nextKind = value as ConsolidationPeriodKind;
        input.onPeriodKindChange(nextKind);
        if (input.year === null || input.month === null) return;
        if (nextKind === "year" && input.month !== 12) changePeriod(input.year, 12);
        if (nextKind === "quarter") {
          const quarterEndMonth = Math.ceil(input.month / 3) * 3;
          if (quarterEndMonth !== input.month) changePeriod(input.year, quarterEndMonth);
        }
      },
      ariaLabel: "选择周期类型",
      presentation: "segmented",
    },
    {
      kind: "period",
      key: "accounting-period",
      mode: "nav",
      label: input.year === null || input.month === null
        ? "选择期间"
        : consolidationPeriodLabel(input.year, input.month, input.periodKind),
      onPrevious: () => {
        if (input.year === null || input.month === null) return;
        const next = shiftConsolidationPeriod(input.year, input.month, input.periodKind, -1);
        changePeriod(next.year, next.month);
      },
      onNext: () => {
        if (input.year === null || input.month === null) return;
        const next = shiftConsolidationPeriod(input.year, input.month, input.periodKind, 1);
        changePeriod(next.year, next.month);
      },
      ...(periodValue ? {
        picker: {
          precision: input.periodKind,
          value: periodValue,
          onChange: (value: string) => {
            const next = parseConsolidationPeriod(value, input.periodKind);
            if (next) changePeriod(next.year, next.month);
          },
          ariaLabel: "选择会计期间",
        },
      } : {}),
      disabled: input.loading || input.year === null || input.month === null,
    },
  ];
}

export function buildConsolidationToolbarItems(input: ConsolidationToolbarInput): SurfaceToolbarItems {
  return [
    ...buildStatementPeriodToolbarItems(input),
    ...(input.batchVersions.length > 0 ? [{
      kind: "select" as const,
      key: "batch-version",
      label: "批次版本",
      value: input.batchId === null ? "" : String(input.batchId),
      options: input.batchVersions.map((batch) => ({
        value: String(batch.id),
        label: `${consolidationPeriodLabel(input.year!, input.month!, input.periodKind)} · V${batch.version} · ${BATCH_STATUS_LABELS[batch.status]}`,
      })),
      onChange: (value: string) => input.onBatchChange(Number(value)),
    }] : []),
    ...(input.createVersion ? [{
      kind: "action-group" as const,
      key: "version-actions",
      actions: [{
        key: "create-version",
        kind: "update" as const,
        label: input.createVersion.busy ? "创建中" : `创建 V${input.createVersion.nextVersion}`,
        disabled: input.createVersion.busy || input.loading,
        onClick: input.createVersion.onClick,
      }],
    }] : []),
    ...(input.error ? [{
      kind: "action-group" as const,
      key: "retry",
      actions: [{ key: "retry", kind: "retry" as const, label: "重试", onClick: input.onRefresh }],
    }] : []),
    ...(input.loading ? [{ kind: "text" as const, key: "loading", content: "正在读取期间…" }] : []),
  ];
}
