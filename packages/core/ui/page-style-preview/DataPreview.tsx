import DataTable, { type DataTableColumn } from "../DataTable";
import { PanelCard } from "../BaseCards";
import StatusBadge from "../StatusBadge";
import PreviewToolbar from "./PreviewToolbar";

type ReportRow = {
  id: string;
  subject: string;
  amount: string;
  period: string;
  status: string;
};

const reportRows: ReportRow[] = [
  { id: "r1", subject: "主营业务收入", amount: "¥ 128,000.00", period: "2026-06", status: "已核对" },
  { id: "r2", subject: "管理费用", amount: "¥ 18,600.00", period: "2026-06", status: "待确认" },
  { id: "r3", subject: "库存商品", amount: "¥ 76,420.00", period: "2026-06", status: "已核对" },
];

const columns: DataTableColumn<ReportRow>[] = [
  { key: "subject", label: "科目", required: true, render: (row) => <strong>{row.subject}</strong> },
  { key: "amount", label: "金额", defaultVisible: true, className: "text-right", render: (row) => row.amount },
  { key: "period", label: "期间", defaultVisible: true, render: (row) => row.period },
  {
    key: "status",
    label: "状态",
    defaultVisible: true,
    render: (row) => <StatusBadge label={row.status} variant={row.status === "已核对" ? "green" : "yellow"} />,
  },
];

export default function DataPreview({ activeChild }: { activeChild: string }) {
  const title = activeChild === "account" ? "科目表" : "财报数据";

  return (
    <div className="space-y-3">
      <PreviewToolbar totalLabel="共 86 条" />
      <PanelCard title={title} bodyClassName="p-0">
        <div className="overflow-hidden">
          <DataTable
            rows={reportRows}
            columns={columns}
            visibleColumns={["amount", "period", "status"]}
            rowKey={(row) => row.id}
            density="compact"
          />
        </div>
      </PanelCard>
    </div>
  );
}
