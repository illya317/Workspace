import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : value),
  z.string().optional(),
);

const optionalNumber = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().optional(),
);

const optionalPositiveNumber = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().positive().optional(),
);

const optionalDate = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD").optional(),
);

export const costQuerySchema = z.object({
  importId: optionalPositiveNumber,
  year: optionalNumber,
  month: optionalNumber,
  dateFrom: optionalDate,
  dateTo: optionalDate,
  productName: optionalString,
  customerName: optionalString,
  sourceFile: optionalString,
  tableName: optionalString,
  metricKey: optionalString,
  category: optionalString,
  page: optionalNumber,
  pageSize: optionalNumber,
});

const shipmentQueryShape = {
  importId: optionalPositiveNumber,
  dateFrom: optionalDate,
  dateTo: optionalDate,
  productName: optionalString,
  customerName: optionalString,
  departmentId: optionalPositiveNumber,
  page: optionalNumber,
  pageSize: optionalNumber,
  sortBy: z.enum(["date", "quantity", "amount", "receivedAmount"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
};

function validateDateRange(
  value: { dateFrom?: string; dateTo?: string },
  context: z.RefinementCtx,
) {
  if (Boolean(value.dateFrom) !== Boolean(value.dateTo)) {
    context.addIssue({ code: "custom", path: [value.dateFrom ? "dateTo" : "dateFrom"], message: "开始和结束日期必须同时提供" });
  }
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "结束日期不能早于开始日期" });
  }
}

export const shipmentQuerySchema = z.object(shipmentQueryShape).superRefine(validateDateRange);

export const shipmentAnalyticsQuerySchema = z.object({
  ...shipmentQueryShape,
  grain: z.enum(["day", "month", "quarter", "year"]).optional(),
  groupBy: z.enum(["customer", "salesperson", "product", "productSpec"]).optional(),
  comparison: z.enum(["none", "previousYear"]).optional(),
}).superRefine(validateDateRange);

const operationalAnalyticsScopeShape = {
  scopeType: z.enum(["personal", "department", "project"]),
  scopeId: z.coerce.number().int().positive(),
};

export const operationalAnalyticsShipmentQuerySchema = z.object({
  ...shipmentQueryShape,
  ...operationalAnalyticsScopeShape,
}).superRefine(validateDateRange);

export const operationalAnalyticsShipmentAnalyticsQuerySchema = z.object({
  ...shipmentQueryShape,
  ...operationalAnalyticsScopeShape,
  grain: z.enum(["day", "month", "quarter", "year"]).optional(),
  groupBy: z.enum(["customer", "salesperson", "product", "productSpec"]).optional(),
  comparison: z.enum(["none", "previousYear"]).optional(),
}).superRefine(validateDateRange);
