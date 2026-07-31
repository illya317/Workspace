import type {
  DataSurfaceColumnSpec,
  DataSurfaceStructuredCellSpec,
} from "@workspace/core/ui";
import type {
  CaptableRound,
  CaptableShareholderRow,
  FinancingRound,
  ShareCapitalEventRecord,
  ShareCapitalEventType,
  ShareholderPosition,
} from "../types";

export type ShareCapitalTransactionTableRow = {
  key: string;
  eventSequence: number;
  eventName: string;
  eventType: ShareCapitalEventType;
  effectiveDate: string | null;
  recordStatus: "confirmed" | "pending";
  fromPartyName: string | null;
  toPartyName: string | null;
  registeredCapitalAmountYuan: number;
  considerationAmountYuan: number | null;
  registeredCapitalBeforeYuan: number | null;
  registeredCapitalAfterYuan: number | null;
};

export const SHAREHOLDER_COLUMNS: DataSurfaceColumnSpec<ShareholderPosition>[] = [
  {
    key: "name",
    label: "股东",
    required: true,
    width: "md",
    wrap: "nowrap",
    cell: (row) => ({ kind: "text", value: row.name, emphasis: "strong" }),
  },
  {
    key: "confirmedCapital",
    label: "当前认缴资本（万元）",
    numeric: true,
    width: "lg",
    wrap: "nowrap",
    cell: (row) => formatWanYuan(row.confirmedSubscribedCapitalYuan),
  },
  {
    key: "shareRatio",
    label: "当前持股比例",
    numeric: true,
    width: "md",
    wrap: "nowrap",
    cell: (row) => formatPercent(row.shareRatio),
  },
  {
    key: "pendingDelta",
    label: "待变更资本（万元）",
    numeric: true,
    width: "lg",
    wrap: "nowrap",
    cell: (row) => row.pendingCapitalDeltaYuan === null
      ? "金额待补"
      : row.pendingCapitalDeltaYuan === 0
      ? "—"
      : ({
          kind: "text",
          value: formatSignedWanYuan(row.pendingCapitalDeltaYuan),
          tone: "warning",
          emphasis: "medium",
        }),
  },
  {
    key: "projectedCapital",
    label: "变更后资本（万元）",
    numeric: true,
    width: "lg",
    wrap: "nowrap",
    cell: (row) => formatWanYuan(row.projectedSubscribedCapitalYuan),
  },
  {
    key: "period",
    label: "股权活动期间",
    width: "xl",
    wrap: "nowrap",
    cell: (row) => `${row.firstEventDate ?? "—"} 至 ${row.latestEventDate ?? "—"}`,
  },
];

export const SHAREHOLDER_VISIBLE_COLUMNS = SHAREHOLDER_COLUMNS.map((column) => column.key);

export const CAPITAL_TRANSACTION_COLUMNS: DataSurfaceColumnSpec<ShareCapitalTransactionTableRow>[] = [
  {
    key: "event",
    label: "轮次 / 事项",
    required: true,
    width: "wide",
    wrap: "nowrap",
    cell: (row) => ({
      kind: "group",
      direction: "column",
      items: [
        {
          kind: "group",
          direction: "row",
          items: [
            { kind: "text", value: `第${row.eventSequence}次 · ${row.eventName}`, emphasis: "strong" },
            {
              kind: "badge",
              label: row.recordStatus === "confirmed" ? "已登记" : "待变更",
              tone: row.recordStatus === "confirmed" ? "green" : "amber",
            },
          ],
        },
        { kind: "text", value: EVENT_TYPE_LABELS[row.eventType], tone: "muted" },
      ],
    }),
  },
  {
    key: "effectiveDate",
    label: "生效日期",
    width: "md",
    wrap: "nowrap",
    cell: (row) => row.effectiveDate ?? "日期未知",
  },
  {
    key: "direction",
    label: "转出方 → 转入方",
    width: "xl",
    wrap: "nowrap",
    cell: (row) => `${row.fromPartyName ?? "新增注册资本"} → ${row.toPartyName ?? "注销注册资本"}`,
  },
  {
    key: "capitalAmount",
    label: "认缴资本额（万元）",
    numeric: true,
    width: "lg",
    wrap: "nowrap",
    cell: (row) => formatWanYuan(row.registeredCapitalAmountYuan),
  },
  {
    key: "consideration",
    label: "交易对价（万元）",
    numeric: true,
    width: "lg",
    wrap: "nowrap",
    cell: (row) => row.considerationAmountYuan === null ? "—" : formatWanYuan(row.considerationAmountYuan),
  },
  {
    key: "registeredCapital",
    label: "公司注册资本前 → 后（万元）",
    numeric: true,
    width: "xl",
    wrap: "nowrap",
    cell: (row) => `${formatWanYuan(row.registeredCapitalBeforeYuan)} → ${formatWanYuan(row.registeredCapitalAfterYuan)}`,
  },
];

export const CAPITAL_TRANSACTION_VISIBLE_COLUMNS = CAPITAL_TRANSACTION_COLUMNS.map((column) => column.key);

export function flattenShareCapitalTransactions(
  events: ShareCapitalEventRecord[],
  selectedPartyId: number | null,
): ShareCapitalTransactionTableRow[] {
  return events.flatMap((event) => event.transactions
    .filter((transaction) => selectedPartyId === null
      || transaction.fromPartyId === selectedPartyId
      || transaction.toPartyId === selectedPartyId)
    .map((transaction) => ({
      key: `${event.id}-${transaction.id}`,
      eventSequence: event.sequence,
      eventName: event.eventName,
      eventType: event.eventType,
      effectiveDate: event.effectiveDate,
      recordStatus: event.recordStatus,
      fromPartyName: transaction.fromPartyName,
      toPartyName: transaction.toPartyName,
      registeredCapitalAmountYuan: transaction.registeredCapitalAmountYuan,
      considerationAmountYuan: transaction.considerationAmountYuan,
      registeredCapitalBeforeYuan: event.registeredCapitalBeforeYuan,
      registeredCapitalAfterYuan: event.registeredCapitalAfterYuan,
    })));
}

export function createCaptableStructuredRows(
  companyName: string,
  rounds: CaptableRound[],
  shareholders: CaptableShareholderRow[],
): DataSurfaceStructuredCellSpec[][] {
  const roundHeaderCells = rounds.map((round): DataSurfaceStructuredCellSpec => ({
    header: true,
    align: "center",
    colSpan: 2,
    tone: round.recordStatus === "pending" ? "warning" : undefined,
    content: round.recordStatus === "pending"
      ? {
          kind: "stack",
          items: [
            { kind: "text", value: round.label, emphasis: "strong" },
            { kind: "badge", label: "待变更", tone: "amber" },
          ],
          gap: "xs",
        }
      : round.label,
  }));

  const dateHeaderCells = rounds.map((round): DataSurfaceStructuredCellSpec => ({
    header: true,
    align: "center",
    colSpan: 2,
    tone: round.recordStatus === "pending" ? "warning" : "muted",
    content: round.effectiveDate ?? "日期未知",
  }));

  const measureHeaderCells = rounds.flatMap((round): DataSurfaceStructuredCellSpec[] => [
    {
      header: true,
      align: "right",
      tone: round.recordStatus === "pending" ? "warning" : undefined,
      content: "认缴资本",
    },
    {
      header: true,
      align: "right",
      tone: round.recordStatus === "pending" ? "warning" : undefined,
      content: "比例",
    },
  ]);

  const shareholderRows = shareholders.map((shareholder): DataSurfaceStructuredCellSpec[] => [
    {
      content: shareholder.name,
      cellRole: "label",
      emphasis: "strong",
    },
    ...rounds.flatMap((round): DataSurfaceStructuredCellSpec[] => {
      const position = shareholder.positions.find((item) => item.eventId === round.eventId);
      const isPresent = position?.isPresent ?? false;
      const tone = round.recordStatus === "pending" && isPresent ? "warning" as const : undefined;
      return [
        {
          align: "right",
          tone,
          content: isPresent ? formatWanYuan(position?.subscribedCapitalYuan ?? null) : "",
        },
        {
          align: "right",
          tone,
          content: isPresent ? formatPercent(position?.shareRatio ?? null) : "",
        },
      ];
    }),
  ]);

  const totalRow: DataSurfaceStructuredCellSpec[] = [
    {
      header: true,
      content: "注册资本合计",
      emphasis: "strong",
    },
    ...rounds.flatMap((round): DataSurfaceStructuredCellSpec[] => [
      {
        header: true,
        align: "right",
        tone: round.recordStatus === "pending" ? "warning" : undefined,
        content: formatWanYuan(round.totalRegisteredCapitalYuan),
      },
      {
        header: true,
        align: "right",
        tone: round.recordStatus === "pending" ? "warning" : undefined,
        content: round.totalRegisteredCapitalYuan === null ? "待核实" : "100.00%",
      },
    ]),
  ];

  return [
    [{ header: true, content: companyName }, ...roundHeaderCells],
    [{ header: true, content: "生效日期" }, ...dateHeaderCells],
    [{ header: true, content: "认缴资本" }, ...measureHeaderCells],
    ...shareholderRows,
    totalRow,
  ];
}

export function createFinancingStructuredRows(
  rounds: FinancingRound[],
): DataSurfaceStructuredCellSpec[][] {
  const contributors = new Map<number, string>();
  for (const round of rounds) {
    for (const contribution of round.contributions) {
      contributors.set(contribution.partyId, contribution.partyName);
    }
  }

  const values = (
    getValue: (round: FinancingRound) => string,
  ): DataSurfaceStructuredCellSpec[] => rounds.map((round) => ({
    align: "right",
    tone: round.recordStatus === "pending" ? "warning" : undefined,
    content: getValue(round),
  }));

  const contributionRows = [...contributors].map(([partyId, partyName]) => [
    {
      content: partyName,
      cellRole: "label" as const,
      emphasis: "strong" as const,
    },
    ...values((round) => {
      const contribution = round.contributions.find((item) => item.partyId === partyId);
      return contribution ? `${formatWanYuan(contribution.considerationAmountYuan)} 万元` : "";
    }),
  ]);

  return [
    [
      { header: true, content: "估值 / 出资" },
      ...rounds.map((round): DataSurfaceStructuredCellSpec => ({
        header: true,
        align: "center",
        tone: round.recordStatus === "pending" ? "warning" : undefined,
        content: round.recordStatus === "pending"
          ? {
              kind: "stack",
              items: [
                { kind: "text", value: round.label, emphasis: "strong" },
                { kind: "badge", label: "待变更", tone: "amber" },
              ],
              gap: "xs",
            }
          : round.label,
      })),
    ],
    [{ header: true, content: "生效日期" }, ...values((round) => round.effectiveDate ?? "日期未知")],
    [{
      header: true,
      content: "资金性质",
    }, ...values((round) => round.kind === "primary" ? "公司增资" : "股权转让")],
    [{
      header: true,
      content: "投前注册资本",
    }, ...values((round) => `${formatWanYuan(round.registeredCapitalBeforeYuan)} 万元`)],
    [{
      header: true,
      content: "新增 / 转让认缴资本",
    }, ...values((round) => `${formatWanYuan(round.pricedRegisteredCapitalYuan)} 万元`)],
    [{
      header: true,
      content: "每 1 元注册资本价格",
    }, ...values((round) => `${formatUnitPrice(round.pricePerRegisteredCapitalYuan)} 元`)],
    [{
      header: true,
      content: "投前 / 隐含估值",
    }, ...values((round) => formatValuation(round.preMoneyValuationYuan))],
    ...contributionRows,
    [{
      header: true,
      content: "本轮资金合计",
      emphasis: "strong",
    }, ...values((round) => `${formatWanYuan(round.totalConsiderationYuan)} 万元`)],
    [{
      header: true,
      content: "投后估值",
      emphasis: "strong",
    }, ...values((round) => round.kind === "primary"
      ? formatValuation(round.postMoneyValuationYuan)
      : "—")],
  ];
}

const EVENT_TYPE_LABELS: Record<ShareCapitalEventType, string> = {
  incorporation: "设立",
  capital_increase: "增资",
  capital_reduction: "减资",
  transfer: "股权转让",
  buyback: "回购",
  adjustment: "调整",
  confirmation_snapshot: "确认快照",
};

export function formatWanYuan(value: number | null) {
  if (value === null) return "待核实";
  return (value / 10_000).toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}

function formatSignedWanYuan(value: number) {
  const amount = formatWanYuan(Math.abs(value));
  return `${value > 0 ? "+" : "−"}${amount}`;
}

export function formatPercent(value: number | null) {
  if (value === null) return "待核实";
  return `${(value * 100).toFixed(2)}%`;
}

export function formatRelationshipRatio(
  previous: number | null,
  current: number | null,
  status: "confirmed" | "pending",
) {
  const currentLabel = current === null ? "比例未录入" : formatPercent(current);
  if (status !== "pending") return currentLabel;
  const previousLabel = previous === null ? "未登记" : formatPercent(previous);
  return `${previousLabel} → ${currentLabel}`;
}

function formatUnitPrice(value: number) {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}

function formatValuation(value: number) {
  return value >= 100_000_000
    ? `${(value / 100_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 亿元`
    : `${formatWanYuan(value)} 万元`;
}
