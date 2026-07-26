import type { ShareCapitalEventType } from "../../types";

type CapitalEventValuationTransaction = {
  registeredCapitalAmountYuan: number;
  considerationAmountYuan: number | null;
};

type CapitalEventValuationInput = {
  eventType: ShareCapitalEventType;
  registeredCapitalBeforeYuan: number;
  registeredCapitalAfterYuan: number;
  transactions: readonly CapitalEventValuationTransaction[];
};

export type CapitalEventValuation = {
  kind: "primary" | "secondary";
  pricedRegisteredCapitalYuan: number;
  totalConsiderationYuan: number;
  pricePerRegisteredCapitalYuan: number;
  preMoneyValuationYuan: number;
  postMoneyValuationYuan: number;
};

export function deriveCapitalEventValuation(
  input: CapitalEventValuationInput,
): CapitalEventValuation | null {
  if (input.eventType !== "capital_increase" && input.eventType !== "transfer") return null;

  if (
    input.transactions.length === 0
    || input.transactions.some((transaction) => (
      transaction.considerationAmountYuan === null
      || transaction.considerationAmountYuan <= 0
      || transaction.registeredCapitalAmountYuan <= 0
    ))
  ) return null;

  const pricedRegisteredCapitalYuan = input.transactions.reduce(
    (sum, transaction) => sum + transaction.registeredCapitalAmountYuan,
    0,
  );
  const totalConsiderationYuan = input.transactions.reduce(
    (sum, transaction) => sum + (transaction.considerationAmountYuan ?? 0),
    0,
  );
  if (pricedRegisteredCapitalYuan <= 0 || totalConsiderationYuan <= 0) return null;

  const pricePerRegisteredCapitalYuan = totalConsiderationYuan / pricedRegisteredCapitalYuan;
  const preMoneyValuationYuan = pricePerRegisteredCapitalYuan * input.registeredCapitalBeforeYuan;
  const postMoneyValuationYuan = input.eventType === "capital_increase"
    ? pricePerRegisteredCapitalYuan * input.registeredCapitalAfterYuan
    : preMoneyValuationYuan;

  return {
    kind: input.eventType === "capital_increase" ? "primary" : "secondary",
    pricedRegisteredCapitalYuan,
    totalConsiderationYuan,
    pricePerRegisteredCapitalYuan,
    preMoneyValuationYuan,
    postMoneyValuationYuan,
  };
}
