import {
  classifyInclusiveBusinessPeriod,
  type BusinessTemporalPosition,
} from "@workspace/platform/contracts/business-temporal";

type ContractTemporalFields = {
  firstContractStartDate?: string | null;
  firstContractEndDate?: string | null;
  secondContractStartDate?: string | null;
  secondContractEndDate?: string | null;
  thirdContractStartDate?: string | null;
  thirdContractEndDate?: string | null;
  permanentContractDate?: string | null;
  endDate?: string | null;
};

export function contractTemporalPosition(
  contract: ContractTemporalFields,
  asOfDate: string,
): BusinessTemporalPosition {
  const terminationState = classifyInclusiveBusinessPeriod({
    validThrough: contract.endDate,
  }, asOfDate);
  if (terminationState === "invalid" || terminationState === "past") return terminationState;

  const periods = [
    {
      validFrom: contract.firstContractStartDate,
      validThrough: contract.firstContractEndDate,
    },
    {
      validFrom: contract.secondContractStartDate,
      validThrough: contract.secondContractEndDate,
    },
    {
      validFrom: contract.thirdContractStartDate,
      validThrough: contract.thirdContractEndDate,
    },
    {
      validFrom: contract.permanentContractDate,
      validThrough: contract.permanentContractDate ? contract.endDate : null,
    },
  ].filter((period) => period.validFrom || period.validThrough);

  if (periods.length === 0) return terminationState;
  const states = periods.map((period) => classifyInclusiveBusinessPeriod(period, asOfDate));
  if (states.includes("invalid")) return "invalid";
  if (states.includes("current")) return "current";
  if (states.includes("upcoming")) return "upcoming";
  return "past";
}
