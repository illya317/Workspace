import {
  createEmptySection,
  createFieldsSection,
  createMessageSection,
  createPageTableSection,
  createPanelSection,
  createStatusSection,
} from "@workspace/core/ui";
import type {
  BodySurfaceSectionSpec,
  DataSurfaceColumnSpec,
} from "@workspace/core/ui";

import {
  comparisonExplanationStatusLabel,
  comparisonExplanationStatusTone,
  comparisonRunStatusLabel,
} from "./statement-comparison-model";
import { amountCell, fingerprintText } from "./statement-comparison-sections";
import type {
  ComparisonMappingItemDto,
  ComparisonPackageDetailDto,
  ComparisonRunDetailDto,
  ComparisonRunLineDto,
} from "./statement-comparison-types";

// ─── 行 detail 六段 ────────────────────────────────────────────────

function scalarText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export const COMPARISON_ACCOUNTING_NOTICE = "仅解释金额来源；会计处理未评估。";

export function createComparisonLineDetailSections(input: {
  line: ComparisonRunLineDto;
  run: ComparisonRunDetailDto;
}): BodySurfaceSectionSpec[] {
  const { line, run } = input;
  const cell = line.externalCell;
  const diagnostics = line.diagnostics;
  const sections: BodySurfaceSectionSpec[] = [
    // 1. 外部单元格
    createPanelSection("comparison-detail-cell", {
      title: "外部单元格",
      sections: cell ? [
        createMessageSection("comparison-detail-cell-addr", {
          tone: "muted",
          content: `${cell.sheet}!${cell.a1}（类型 ${cell.type}）`,
        }),
        createMessageSection("comparison-detail-cell-values", {
          tone: "muted",
          content: [
            `原始值：${scalarText(cell.value)}　格式化：${cell.text ?? "—"}`,
            `缓存值：${scalarText(cell.cachedValue)}　独立重算：${scalarText(cell.recalculatedValue)}　信任状态：${cell.trust ?? "未参与重算"}`,
            `公式：${cell.formula ? `=${cell.formula}` : "—"}`,
          ].join("\n"),
        }),
      ] : [createMessageSection("comparison-detail-cell-none", {
        tone: "muted",
        content: "该行没有来源 workbook 单元格（系统侧有行而 workbook 缺失）。",
      })],
    }),
    // 2. 系统报表血缘与目标指纹
    createPanelSection("comparison-detail-lineage", {
      title: "系统报表血缘",
      sections: [createMessageSection("comparison-detail-lineage-meta", {
        tone: "muted",
        content: [
          `报表行：${line.lineLabel}（${line.lineCode}）　系统金额：${line.systemAmount ?? "—"}`,
          `目标指纹：${run.targetFingerprint}　orchestrator：${run.orchestratorId}@${run.orchestratorVersion}`,
        ].join("\n"),
      })],
    }),
    // 3. 最佳解释
    createPanelSection("comparison-detail-best", {
      title: "最佳解释",
      sections: [createMessageSection("comparison-detail-best-meta", {
        tone: comparisonExplanationStatusTone(line.explanationStatus),
        content: [
          `状态：${comparisonExplanationStatusLabel(line.explanationStatus)}　方法：${line.explanationMethod ?? "—"}`,
          `已解释金额：${line.explainedAmount ?? "—"}　残差：${line.residualAmount ?? "—"}`,
        ].join("\n"),
      })],
    }),
  ];
  // 4. 来源证据记录
  sections.push(createPanelSection("comparison-detail-evidence", {
    title: `来源证据（${line.evidence.length}）`,
    sections: line.evidence.length > 0 ? [createPageTableSection("comparison-detail-evidence-table", {
      rows: [...line.evidence],
      columns: [
        { key: "label", label: "证据", required: true, width: "xl", cell: (row) => ({ kind: "text", value: row.label, emphasis: "medium", maxChars: 80 }) },
        { key: "sourceKind", label: "来源类别", width: "md", cell: (row) => row.sourceKind },
        { key: "amount", label: "带符号金额", width: "md", align: "right", cell: (row) => amountCell(row.amount) },
        { key: "account", label: "科目", width: "md", cell: (row) => (row.account ? `${row.account.code} ${row.account.name}` : "—") },
        { key: "voucher", label: "凭证", width: "md", cell: (row) => (row.voucher ? `${row.voucher.voucherNo}（${row.voucher.voucherDate}）` : "—") },
        { key: "company", label: "公司", width: "sm", cell: (row) => row.company.code },
      ] satisfies DataSurfaceColumnSpec<(typeof line.evidence)[number]>[],
      visibleColumns: ["label", "sourceKind", "amount", "account", "voucher", "company"],
      rowKey: (row) => row.evidenceId,
      emptyText: "无来源证据",
    })] : [createMessageSection("comparison-detail-evidence-empty", {
      tone: "muted",
      content: "没有命中任何来源证据。",
    })],
  }));
  // 5. 备选/歧义/残差/截断/预算
  sections.push(createPanelSection("comparison-detail-diagnostics", {
    title: "备选与诊断",
    sections: [
      ...(line.alternatives.length > 0 ? [createPageTableSection("comparison-detail-alternatives", {
        rows: [...line.alternatives],
        columns: [
          { key: "rank", label: "排序", width: "sm", align: "right", cell: (row) => String(row.rank) },
          { key: "method", label: "方法", width: "md", cell: (row) => row.method },
          { key: "explainedAmount", label: "已解释", width: "md", align: "right", cell: (row) => amountCell(row.explainedAmount) },
          { key: "residualAmount", label: "残差", width: "md", align: "right", cell: (row) => amountCell(row.residualAmount) },
          { key: "evidenceCount", label: "证据数", width: "sm", align: "right", cell: (row) => String(row.evidence.length) },
        ] satisfies DataSurfaceColumnSpec<(typeof line.alternatives)[number]>[],
        visibleColumns: ["rank", "method", "explainedAmount", "residualAmount", "evidenceCount"],
        rowKey: (row) => `${row.rank}-${row.method}`,
        emptyText: "无备选解释",
      })] : []),
      createMessageSection("comparison-detail-diagnostics-meta", {
        tone: diagnostics && (diagnostics.candidatesTruncated || diagnostics.solver?.truncated) ? "warning" : "muted",
        content: diagnostics ? [
          `候选截断：${diagnostics.candidatesTruncated ? "是" : "否"}　solver 截断：${diagnostics.solver?.truncated ? "是" : "否"}　停止原因：${diagnostics.stopReason}`,
          `预算：maxTerms=${diagnostics.budgets.maxTerms} maxSolutions=${diagnostics.budgets.maxSolutions} 候选上限=${diagnostics.budgets.maxCandidatesAfterFilter} 状态预算=${diagnostics.budgets.maxVisitedStates} 时限=${diagnostics.budgets.deadlineMs}ms`,
          `输入指纹：${fingerprintText(diagnostics.fingerprints.input)}　输出指纹：${fingerprintText(diagnostics.fingerprints.output)}`,
        ].join("\n") : "该行未进行金额来源解释（无差异或无需解释）。",
      }),
    ],
  }));
  // 6. 固定提示
  sections.push(createMessageSection("comparison-detail-notice", {
    tone: "muted",
    content: COMPARISON_ACCOUNTING_NOTICE,
  }));
  return sections;
}

// ─── 就绪（不可变摘要 + 生成对比 + 运行历史）────────────────────────────

export function createComparisonReadySections(input: {
  packageDetail: ComparisonPackageDetailDto | null;
  activeMapping: ComparisonMappingItemDto | null;
  staleMapping: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  creatingRun: boolean;
  archiving: boolean;
  onCreateRun: () => void;
  onRemap: () => void;
  onArchive: () => void;
  onSelectRun: (runId: number) => void;
}): BodySurfaceSectionSpec[] {
  const detail = input.packageDetail;
  if (!detail) {
    return [createStatusSection("comparison-ready-loading", { kind: "loading", content: "正在读取 Excel" })];
  }
  const mapping = input.activeMapping;
  const canStart = input.canCreate && !input.staleMapping && Boolean(mapping || (detail.detection && input.canUpdate));
  return [createPanelSection("comparison-ready-summary", {
      title: "Excel 报表",
      sections: [
        createMessageSection("comparison-ready-package", {
          tone: "muted",
          content: `${detail.fileName} · ${(detail.fileSize / 1024).toFixed(0)} KB`,
        }),
        ...(input.staleMapping ? [createMessageSection("comparison-ready-stale", {
          tone: "warning",
          content: "系统报表已经变化，请重新选择 Excel 报表后再开始对比。",
        })] : []),
        createFieldsSection("comparison-ready-actions", [], {
          layout: { columns: 1 },
          actions: [
            {
              key: "create-run",
              action: "save",
              label: input.creatingRun ? "正在对比" : "开始对比",
              disabled: input.creatingRun || !canStart,
              onClick: input.onCreateRun,
            },
            {
              key: "remap",
              action: "cancel",
              label: "重新选择 Excel 报表",
              disabled: input.creatingRun || !detail.detection || !input.canUpdate,
              onClick: input.onRemap,
            },
          ],
        }),
        ...(!input.canCreate ? [createMessageSection("comparison-ready-no-create", {
          tone: "muted",
          content: "当前账号没有开始对比的权限。",
        })] : []),
      ],
    })];
}

// ─── 失败/失效 ─────────────────────────────────────────────────────

export function createComparisonFailedSections(input: {
  message: string;
  retryHint?: string | null;
}): BodySurfaceSectionSpec[] {
  return [
    createStatusSection("comparison-failed", { kind: "error", content: input.message }),
    ...(input.retryHint ? [createMessageSection("comparison-failed-retry", {
      tone: "muted",
      content: input.retryHint,
    })] : []),
  ];
}

// ─── 状态占位 ──────────────────────────────────────────────────────

export function createComparisonEmptySections(): BodySurfaceSectionSpec[] {
  return [
    createEmptySection("comparison-empty", {
      content: "选择系统报表，上传一份 Excel 开始对比。",
      presentation: "card",
    }),
    createMessageSection("comparison-empty-boundary", {
      tone: "muted",
      content: "对比只读取 Excel 和系统报表，不会修改数据或生成调整分录。",
    }),
  ];
}

export function createComparisonParsingSections(): BodySurfaceSectionSpec[] {
  return [createStatusSection("comparison-parsing", {
    kind: "loading",
    content: "正在读取 Excel 并识别报表内容…",
  })];
}

export { comparisonRunStatusLabel };
