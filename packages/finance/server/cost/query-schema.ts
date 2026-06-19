import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : value),
  z.string().optional(),
);

const optionalNumber = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().optional(),
);

export const costQuerySchema = z.object({
  year: optionalNumber,
  month: optionalNumber,
  productName: optionalString,
  customerName: optionalString,
  sourceFile: optionalString,
  tableName: optionalString,
  metricKey: optionalString,
  category: optionalString,
  page: optionalNumber,
  pageSize: optionalNumber,
});
