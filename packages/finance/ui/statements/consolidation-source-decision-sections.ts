import {
  createFormSection,
  type BodySurfaceSectionSpec,
  type FormSurfaceFieldSpec,
} from "@workspace/core/ui";
import type { ConsolidationOverview, SaveConsolidationSourcesInput } from "@workspace/finance/types";
import type { Dispatch, SetStateAction } from "react";

import { choiceField, textField } from "./consolidation-decision-presenters";
import {
  buildSourceFreezeInput,
  type CapitalRatePolicyDrafts,
  type CurrencyPolicyDrafts,
  type InvestmentEntitySelections,
} from "./consolidation-workbench-model";

type Setter<T> = Dispatch<SetStateAction<T>>;

export function buildConsolidationSourceDecisionSections(input: {
  data: ConsolidationOverview | null;
  canUpdate: boolean;
  busy: boolean;
  systemEvidence: string;
  setSystemEvidence: Setter<string>;
  currencyPolicies: CurrencyPolicyDrafts;
  setCurrencyPolicies: Setter<CurrencyPolicyDrafts>;
  investmentEntitySelections: InvestmentEntitySelections;
  setInvestmentEntitySelections: Setter<InvestmentEntitySelections>;
  capitalRatePolicies: CapitalRatePolicyDrafts;
  setCapitalRatePolicies: Setter<CapitalRatePolicyDrafts>;
  notifyError: (message: string) => void;
  saveSources: (value: Omit<SaveConsolidationSourcesInput, "expectedRevision">) => Promise<boolean>;
}): BodySurfaceSectionSpec[] {
  const {
    data,
    canUpdate,
    busy,
    systemEvidence,
    setSystemEvidence,
    currencyPolicies,
    setCurrencyPolicies,
    investmentEntitySelections,
    setInvestmentEntitySelections,
    capitalRatePolicies,
    setCapitalRatePolicies,
    notifyError,
    saveSources,
  } = input;
  const batch = data?.batch;
  if (!data || !batch || batch.status !== "draft") return [];
  const cadEntityOptions = batch.entities
    .filter((entity) => entity.role === "subsidiary" && currencyPolicies[entity.id]?.functionalCurrency === "CAD")
    .map((entity) => ({ value: String(entity.id), label: `${entity.companyCode} · ${entity.companyName}` }));
  const historicalRateOptions = data.fxPolicy.rates
    .filter((rate) => rate.rateKind === "historicalInvestment" || rate.rateKind === "centralParity")
    .map((rate) => ({ value: String(rate.id), label: `${rate.rateDate} · 1 ${rate.baseCurrency} = ${rate.rate} ${rate.quoteCurrency}` }));
  const fields: FormSurfaceFieldSpec[] = [
    textField("systemEvidence", "系统账快照核对依据", systemEvidence, setSystemEvidence, { span: 3, multiline: true }),
    ...batch.entities.flatMap((entity) => {
      const policy = currencyPolicies[entity.id] ?? { functionalCurrency: "" as const, evidence: "" };
      const capitalPolicy = capitalRatePolicies[entity.id] ?? { exchangeRateId: null, contributionDate: "", originalAmount: 0, evidence: "" };
      return [
        choiceField(
          `currency-${entity.id}`,
          `${entity.companyName}本位币`,
          policy.functionalCurrency,
          [{ value: "CNY", label: "人民币 CNY" }, { value: "CAD", label: "加元 CAD" }],
          (value) => {
            const functionalCurrency = value as "CNY" | "CAD";
            setCurrencyPolicies((current) => ({
              ...current,
              [entity.id]: { ...(current[entity.id] ?? policy), functionalCurrency },
            }));
            if (functionalCurrency !== "CAD") {
              setInvestmentEntitySelections((current) => {
                const next = { ...current };
                for (const [voucherItemId, selectedEntityId] of Object.entries(next)) {
                  if (selectedEntityId === entity.id) delete next[Number(voucherItemId)];
                }
                return next;
              });
              setCapitalRatePolicies((current) => {
                const next = { ...current };
                delete next[entity.id];
                return next;
              });
            }
          },
        ),
        textField(`currency-evidence-${entity.id}`, `${entity.companyName}本位币依据`, policy.evidence, (value) => {
          setCurrencyPolicies((current) => ({
            ...current,
            [entity.id]: { ...(current[entity.id] ?? policy), evidence: value },
          }));
        }, { required: true, span: 2 }),
        ...(policy.functionalCurrency === "CAD" ? [
          choiceField(
            `capital-rate-${entity.id}`,
            `${entity.companyName}权益资本历史汇率`,
            capitalPolicy.exchangeRateId ? String(capitalPolicy.exchangeRateId) : "",
            historicalRateOptions,
            (value) => setCapitalRatePolicies((current) => ({
              ...current,
              [entity.id]: { ...capitalPolicy, exchangeRateId: value ? Number(value) : null },
            })),
          ),
          {
            key: `capital-date-${entity.id}`,
            label: `${entity.companyName}权益资本出资日`,
            required: true,
            spec: { valueType: "date", control: "temporal", precision: "date" },
            value: capitalPolicy.contributionDate,
            placeholder: "选择出资日期",
            onChange: (value: unknown) => setCapitalRatePolicies((current) => ({
              ...current,
              [entity.id]: { ...capitalPolicy, contributionDate: String(value ?? "") },
            })),
          },
          {
            key: `capital-amount-${entity.id}`,
            label: `${entity.companyName}权益资本原币金额`,
            required: true,
            spec: { valueType: "number", control: "number", validation: { min: 0.01 } },
            value: capitalPolicy.originalAmount || "",
            step: 0.01,
            inputMode: "decimal",
            onChange: (value: unknown) => setCapitalRatePolicies((current) => ({
              ...current,
              [entity.id]: { ...capitalPolicy, originalAmount: Number(value) || 0 },
            })),
          },
          textField(
            `capital-evidence-${entity.id}`,
            `${entity.companyName}权益资本汇率依据`,
            capitalPolicy.evidence,
            (value) => setCapitalRatePolicies((current) => ({
              ...current,
              [entity.id]: { ...capitalPolicy, evidence: value },
            })),
            { required: true, span: 3, multiline: true },
          ),
        ] satisfies FormSurfaceFieldSpec[] : []),
      ];
    }),
    ...data.fxPolicy.investmentEvidence.map((investment) => choiceField(
      `investment-entity-${investment.id}`,
      `投资凭证 ${investment.companyCode} · ${investment.voucherNo} 被投资主体`,
      investmentEntitySelections[investment.id] ? String(investmentEntitySelections[investment.id]) : "",
      cadEntityOptions,
      (value) => setInvestmentEntitySelections((current) => {
        const next = { ...current };
        if (value) next[investment.id] = Number(value);
        else delete next[investment.id];
        return next;
      }),
    )),
  ];
  return [createFormSection("consolidation-source-freeze", {
    kind: "filters",
    header: { title: "冻结来源与折算口径", description: "逐主体确认本位币；CAD 三表绑定本期及适用的比较期期末汇率，非零权益资本另绑定出资日历史汇率与原币金额；投资付款按凭证绑定被投资主体和投资日历史汇率。" },
    content: { items: fields, layout: { flow: "grid", columns: 3, density: "compact", commandPlacement: "below" } },
    actions: [{ key: "freeze", action: "save", label: busy ? "正在冻结…" : "冻结当前来源", disabled: busy || !canUpdate }],
    submit: { onSubmit: () => {
      const built = buildSourceFreezeInput(data, currencyPolicies, investmentEntitySelections, systemEvidence, capitalRatePolicies);
      if (!built.ok) {
        notifyError(built.error);
        return;
      }
      void saveSources(built.input);
    } },
  })];
}
