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
  comparisonLifecycleLabel,
  comparisonReportTypeLabel,
  comparisonRunStatusLabel,
} from "./statement-comparison-model";
import { amountCell, fingerprintText } from "./statement-comparison-sections";
import type {
  ComparisonMappingItemDto,
  ComparisonPackageDetailDto,
  ComparisonRunDetailDto,
  ComparisonRunLineDto,
  ComparisonRunListItemDto,
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

const RUN_COLUMNS: DataSurfaceColumnSpec<ComparisonRunListItemDto>[] = [
  { key: "id", label: "运行", required: true, width: "sm", align: "right", cell: (row) => `#${row.id}` },
  { key: "status", label: "状态", width: "md", cell: (row) => ({ kind: "text", value: comparisonRunStatusLabel(row.status), tone: row.status === "failed" ? "danger" : "default" }) },
  { key: "inputFingerprint", label: "输入指纹", width: "lg", cell: (row) => ({ kind: "text", value: fingerprintText(row.inputFingerprint), font: "mono" }) },
  { key: "createdAt", label: "创建时间", width: "md", cell: (row) => row.createdAt.slice(0, 19).replace("T", " ") },
  { key: "completedAt", label: "完成时间", width: "md", cell: (row) => (row.completedAt ? row.completedAt.slice(0, 19).replace("T", " ") : "—") },
];

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
    return [createStatusSection("comparison-ready-loading", { kind: "loading", content: "正在读取证据包" })];
  }
  const mapping = input.activeMapping;
  const runs = mapping?.runs ?? [];
  const hasReferencedRuns = detail.mappings.some((entry) => entry.runs.length > 0);
  const runHistory = runs.length > 0 ? [createPageTableSection("comparison-run-history", {
    rows: [...runs],
    columns: RUN_COLUMNS,
    visibleColumns: RUN_COLUMNS.map((column) => column.key),
    rowKey: (row) => row.id,
    emptyText: "尚无对比运行",
    onRowClick: (row) => input.onSelectRun(row.id),
  })] : [createMessageSection("comparison-run-history-empty", {
    tone: "muted",
    content: "尚无对比运行。生成对比会创建新的不可变版本，不会修改历史运行。",
  })];
  return [
    createPanelSection("comparison-ready-summary", {
      title: "不可变对比输入摘要",
      sections: [
        createMessageSection("comparison-ready-package", {
          tone: "muted",
          content: [
            `证据包：${detail.fileName}（${(detail.fileSize / 1024).toFixed(0)} KB · ${comparisonLifecycleLabel(detail.lifecycle)}）`,
            `workbook SHA-256：${detail.sha256}`,
          ].join("\n"),
        }),
        createMessageSection("comparison-ready-mapping", {
          tone: input.staleMapping ? "warning" : "muted",
          content: mapping
            ? `映射 #${mapping.id} · 修订 v${mapping.revision} · ${comparisonReportTypeLabel(mapping.reportType)} · 绑定目标指纹：${fingerprintText(mapping.targetFingerprint)}${input.staleMapping ? "（已失效）" : ""}`
            : "当前系统目标下尚无已确认映射，请先完成映射确认。",
        }),
        createFieldsSection("comparison-ready-actions", [], {
          layout: { columns: 1 },
          actions: [
            {
              key: "create-run",
              action: "save",
              label: input.creatingRun ? "生成中" : "生成对比（新版本）",
              disabled: input.creatingRun || !mapping || input.staleMapping || !input.canCreate,
              onClick: input.onCreateRun,
            },
            {
              key: "remap",
              action: "cancel",
              label: "重新映射",
              disabled: input.creatingRun || !detail.detection || !input.canUpdate,
              onClick: input.onRemap,
            },
            ...(!hasReferencedRuns && input.canUpdate ? [{
              key: "archive",
              action: "cancel" as const,
              label: input.archiving ? "归档中" : "归档未用证据",
              disabled: input.archiving,
              onClick: input.onArchive,
            }] : []),
          ],
        }),
        ...(!input.canCreate ? [createMessageSection("comparison-ready-no-create", {
          tone: "muted",
          content: "当前账号没有创建对比运行的权限；可查看既有运行结果。",
        })] : []),
      ],
    }),
    createPanelSection("comparison-run-history-panel", {
      title: "运行历史",
      sections: runHistory,
    }),
  ];
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
      content: "选择对比对象并解析系统目标后开始差异诊断。",
      presentation: "card",
    }),
    createMessageSection("comparison-empty-boundary", {
      tone: "muted",
      content: "差异诊断只解释金额来源：对比绑定不可变系统目标与上传的证据 workbook，不生成调整、不过账、不评估会计处理。",
    }),
  ];
}

export function createComparisonParsingSections(): BodySurfaceSectionSpec[] {
  return [createStatusSection("comparison-parsing", {
    kind: "loading",
    content: "正在解析上传的 workbook（隔离解析，含安全预检）。可切换目标取消等待；服务端证据行保持不可变。",
  })];
}

export { comparisonRunStatusLabel };
