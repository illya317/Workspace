export type FinanceShipmentGroupBy = "customer" | "salesperson" | "product" | "productSpec";
export type FinanceShipmentMetricKey = "quantity" | "amount" | "receivedAmount";
export type FinanceShipmentTimeGrain = "day" | "month" | "quarter" | "year";

export interface FinanceShipmentAggregateMetric {
  quantity: number | null;
  amount: number | null;
  receivedAmount: number | null;
  unreceivedAmount: number | null;
  collectionRate: number | null;
}

export interface FinanceShipmentAnalyticsTotals extends FinanceShipmentAggregateMetric {
  rowCount: number;
}

export interface FinanceShipmentTrendPoint extends FinanceShipmentAggregateMetric {
  key: string;
  label: string;
}

export interface FinanceShipmentGroupRow extends FinanceShipmentAggregateMetric {
  key: string;
  label: string;
  productName: string | null;
  spec: string | null;
  previousYear: FinanceShipmentAggregateMetric | null;
}

export interface FinanceShipmentAmountLeader {
  key: string;
  label: string;
  amount: number;
}

export interface FinanceShipmentAnalyticsResponse {
  scope: {
    dateFrom: string | null;
    dateTo: string | null;
    grain: FinanceShipmentTimeGrain;
    groupBy: FinanceShipmentGroupBy;
    comparison: "none" | "previousYear";
  };
  totals: FinanceShipmentAnalyticsTotals;
  previousYearTotals: FinanceShipmentAnalyticsTotals | null;
  trend: FinanceShipmentTrendPoint[];
  groups: FinanceShipmentGroupRow[];
  groupCount: number;
  leaders: {
    product: FinanceShipmentAmountLeader | null;
    salesperson: FinanceShipmentAmountLeader | null;
    customer: FinanceShipmentAmountLeader | null;
  };
  coverage: {
    datedRowCount: number;
    monthlyRowCount: number;
    precision: "day" | "month" | "mixed" | "none";
  };
}
