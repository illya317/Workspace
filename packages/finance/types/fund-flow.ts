export type FundFlowActivity = "operating" | "investing" | "financing";
export type FundFlowDirection = "source" | "use";

export interface FundFlowChannel {
  key: string;
  label: string;
  activity: FundFlowActivity;
  amount: number;
  share: number;
}

export interface FundFlowActivitySummary {
  key: FundFlowActivity;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
  inflowShare: number;
}

export interface FundFlowLedgerChannel {
  key: string;
  label: string;
  direction: FundFlowDirection;
  amount: number;
  note: string;
}

export interface FundFlowBalanceSignal {
  key: string;
  label: string;
  opening: number;
  change: number;
  closing: number;
  note: string;
}

export interface FundFlowCompanySummary {
  code: string;
  name: string;
  role: "母公司" | "子公司" | "成员公司";
  inflow: number;
  outflow: number;
  netCashChange: number;
  openingCash: number;
  endingCash: number;
  ledgerNetCashChange: number;
  cashFlowGap: number;
  voucherCount: number;
  cashLinkedVoucherCount: number;
  quality: "ok" | "warning" | "missing";
}

export interface FundFlowAnalysis {
  scope: {
    companyCodes: string[];
    label: string;
    year: number;
    month: number;
    periodLabel: string;
    aggregation: "single" | "uneliminated";
    availableYears: number[];
  };
  metrics: {
    inflow: number;
    outflow: number;
    netCashChange: number;
    endingCash: number;
    financingInflowShare: number;
    operatingCoverage: number | null;
  };
  activities: FundFlowActivitySummary[];
  sources: FundFlowChannel[];
  uses: FundFlowChannel[];
  ledgerChannels: FundFlowLedgerChannel[];
  balanceSignals: FundFlowBalanceSignal[];
  companies: FundFlowCompanySummary[];
  evidence: {
    cashFlowCompanyCount: number;
    voucherCount: number;
    voucherItemCount: number;
    cashLinkedVoucherCount: number;
    cashFlowNetCashChange: number;
    ledgerNetCashChange: number;
    balanceNetCashChange: number;
  };
  warnings: string[];
}
