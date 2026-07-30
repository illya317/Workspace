import type { DataSurfaceColumnSpec, FormSurfaceItemSpec } from "@workspace/core/ui";

import type {
  InvestmentEnterpriseContractRecord,
  InvestmentEnterpriseDiligenceRecord,
  InvestmentEnterpriseDocumentRecord,
  InvestmentEnterpriseMeetingRecord,
  InvestmentEnterpriseMonitoringRecord,
  InvestmentEnterpriseProfileRecord,
  InvestmentEnterpriseRecordKind,
  InvestmentEnterpriseShareholderRecord,
} from "../types/investment-enterprises";

export type InvestmentDraft = Record<string, string | number | null | File>;
export type DraftChange = (key: string, value: string | number | null | File) => void;

const PROFILE_STATUS_OPTIONS = [
  { value: "pipeline", label: "储备项目" }, { value: "active", label: "在投" }, { value: "watch", label: "重点关注" },
  { value: "exiting", label: "退出中" }, { value: "exited", label: "已退出" },
];
const CURRENCY_OPTIONS = ["CNY", "USD", "CAD", "HKD", "EUR"].map((value) => ({ value, label: value }));

function textField(key: string, label: string, draft: InvestmentDraft, onChange: DraftChange, options: { required?: boolean; disabled?: boolean; placeholder?: string } = {}): FormSurfaceItemSpec {
  return {
    key, label,
    spec: { valueType: "string", control: "text", state: options.disabled ? "disabled" : options.required ? "required" : "normal" },
    value: String(draft[key] ?? ""), placeholder: options.placeholder,
    onChange: (value) => onChange(key, String(value ?? "")),
  };
}

function numberField(key: string, label: string, draft: InvestmentDraft, onChange: DraftChange): FormSurfaceItemSpec {
  return {
    key, label, spec: { valueType: "number", control: "number", state: "normal" }, value: draft[key] === null || draft[key] === "" ? null : Number(draft[key]),
    onChange: (value) => onChange(key, value === null || value === "" ? null : Number(value)),
  };
}

function dateField(key: string, label: string, draft: InvestmentDraft, onChange: DraftChange, required = false): FormSurfaceItemSpec {
  return {
    key, label, spec: { valueType: "date", control: "temporal", precision: "date", state: required ? "required" : "normal" }, value: String(draft[key] ?? ""),
    onChange: (value) => onChange(key, String(value ?? "")),
  };
}

function choiceField(key: string, label: string, draft: InvestmentDraft, onChange: DraftChange, options: Array<{ value: string; label: string }>, required = false): FormSurfaceItemSpec {
  return {
    key, label,
    spec: { valueType: "string", control: "choice", state: required ? "required" : "normal", options: { source: "static", items: options, visibleCount: 8 } },
    value: String(draft[key] ?? ""), onChange: (value) => onChange(key, String(value ?? "")),
  };
}

export function emptyProfileDraft(): InvestmentDraft {
  return { companyId: "", portfolioCode: "", investmentStatus: "active", investmentStage: "", industry: "", investmentDate: "", exitDate: "", investmentCurrency: "CNY", investedAmount: null, currentValuation: null, valuationDate: "", investmentLead: "", dealTeam: "", boardSeat: "", investmentThesis: "", keyRisks: "", exitPlan: "", nextReviewDate: "" };
}

export function profileDraft(profile: InvestmentEnterpriseProfileRecord): InvestmentDraft {
  return { ...profile };
}

export function profileFields(input: {
  draft: InvestmentDraft; onChange: DraftChange; candidates?: Array<{ id: number; code: string; name: string }>;
  creating?: boolean; disabled?: boolean;
}): FormSurfaceItemSpec[] {
  const fields: FormSurfaceItemSpec[] = [];
  if (input.creating) fields.push(choiceField("companyId", "公司主体", input.draft, input.onChange, (input.candidates ?? []).map((company) => ({ value: String(company.id), label: `${company.code} · ${company.name}` })), true));
  fields.push(
    textField("portfolioCode", "投资编号", input.draft, input.onChange, { required: true, disabled: input.disabled }),
    choiceField("investmentStatus", "投资状态", input.draft, input.onChange, PROFILE_STATUS_OPTIONS, true),
    textField("investmentStage", "投资阶段", input.draft, input.onChange, { placeholder: "种子轮、A 轮、并购等" }),
    textField("industry", "行业赛道", input.draft, input.onChange),
    dateField("investmentDate", "首次投资日期", input.draft, input.onChange),
    dateField("exitDate", "退出日期", input.draft, input.onChange),
    choiceField("investmentCurrency", "币种", input.draft, input.onChange, CURRENCY_OPTIONS, true),
    numberField("investedAmount", "累计投资金额", input.draft, input.onChange),
    numberField("currentValuation", "当前估值", input.draft, input.onChange),
    dateField("valuationDate", "估值基准日", input.draft, input.onChange),
    textField("investmentLead", "投资负责人", input.draft, input.onChange),
    textField("dealTeam", "项目团队", input.draft, input.onChange),
    textField("boardSeat", "董事/观察员席位", input.draft, input.onChange),
    dateField("nextReviewDate", "下次投后复盘", input.draft, input.onChange),
    textField("investmentThesis", "投资逻辑", input.draft, input.onChange),
    textField("keyRisks", "关键风险", input.draft, input.onChange),
    textField("exitPlan", "退出计划", input.draft, input.onChange),
  );
  return fields;
}

export function emptyRecordDraft(kind: InvestmentEnterpriseRecordKind, profileId: number): InvestmentDraft {
  if (kind === "meeting") return { kind, profileId, meetingType: "shareholders", title: "", meetingDate: "", status: "planned", decisionSummary: "", votingResult: "", followUpOwner: "", followUpDueDate: "", notes: "", sourceReference: "" };
  if (kind === "diligence") return { kind, profileId, workstream: "legal", title: "", riskLevel: "medium", status: "open", finding: "", recommendation: "", ownerName: "", dueDate: "", remediationStatus: "not_started", remediationEvidence: "", sourceReference: "" };
  if (kind === "contract") return { kind, profileId, contractType: "investment_agreement", title: "", counterpartyText: "", signedDate: "", effectiveDate: "", expiryDate: "", noticeDate: "", status: "draft", currency: "CNY", amount: null, keyTerms: "", obligationSummary: "", sourceReference: "" };
  return { kind, profileId, periodEnd: "", status: "draft", currency: "CNY", revenue: null, netProfit: null, cashBalance: null, valuation: null, headcount: null, highlights: "", risks: "", sourceReference: "" };
}

export function recordDraft(kind: InvestmentEnterpriseRecordKind, record: Record<string, unknown>): InvestmentDraft {
  return { kind, ...record } as InvestmentDraft;
}

export function recordFields(kind: InvestmentEnterpriseRecordKind, draft: InvestmentDraft, onChange: DraftChange): FormSurfaceItemSpec[] {
  if (kind === "meeting") return [
    choiceField("meetingType", "会议类型", draft, onChange, [{ value: "shareholders", label: "股东会" }, { value: "board", label: "董事会" }, { value: "supervisors", label: "监事会" }, { value: "special", label: "专项治理会议" }], true),
    textField("title", "会议主题", draft, onChange, { required: true }), dateField("meetingDate", "会议日期", draft, onChange),
    choiceField("status", "状态", draft, onChange, [{ value: "planned", label: "待召开" }, { value: "held", label: "已召开" }, { value: "closed", label: "事项已闭环" }], true),
    textField("decisionSummary", "决议摘要", draft, onChange), textField("votingResult", "表决结果", draft, onChange),
    textField("followUpOwner", "跟进负责人", draft, onChange), dateField("followUpDueDate", "跟进期限", draft, onChange),
    textField("notes", "备注", draft, onChange), textField("sourceReference", "证据引用", draft, onChange),
  ];
  if (kind === "diligence") return [
    choiceField("workstream", "尽调领域", draft, onChange, ["business", "financial", "legal", "tax", "technology", "hr", "esg", "compliance"].map((value) => ({ value, label: diligenceWorkstream(value) })), true),
    textField("title", "问题标题", draft, onChange, { required: true }),
    choiceField("riskLevel", "风险等级", draft, onChange, [{ value: "low", label: "低" }, { value: "medium", label: "中" }, { value: "high", label: "高" }, { value: "critical", label: "重大" }], true),
    choiceField("status", "问题状态", draft, onChange, [{ value: "open", label: "待处理" }, { value: "mitigating", label: "整改中" }, { value: "accepted", label: "风险接受" }, { value: "closed", label: "已关闭" }], true),
    textField("finding", "尽调发现", draft, onChange), textField("recommendation", "建议措施", draft, onChange),
    textField("ownerName", "整改负责人", draft, onChange), dateField("dueDate", "整改期限", draft, onChange),
    choiceField("remediationStatus", "整改进度", draft, onChange, [{ value: "not_started", label: "未开始" }, { value: "in_progress", label: "进行中" }, { value: "verified", label: "已验证" }], true),
    textField("remediationEvidence", "整改证据", draft, onChange), textField("sourceReference", "证据引用", draft, onChange),
  ];
  if (kind === "contract") return [
    choiceField("contractType", "合同类型", draft, onChange, [{ value: "investment_agreement", label: "投资协议" }, { value: "shareholders_agreement", label: "股东协议" }, { value: "articles", label: "公司章程" }, { value: "side_letter", label: "补充/附带协议" }, { value: "loan_security", label: "借款/担保" }, { value: "other", label: "其他" }], true),
    textField("title", "合同名称", draft, onChange, { required: true }), textField("counterpartyText", "合同载明相对方（原文）", draft, onChange),
    dateField("signedDate", "签署日期", draft, onChange), dateField("effectiveDate", "生效日期", draft, onChange), dateField("expiryDate", "到期日期", draft, onChange), dateField("noticeDate", "提醒日期", draft, onChange),
    choiceField("status", "合同状态", draft, onChange, [{ value: "draft", label: "草拟" }, { value: "effective", label: "生效" }, { value: "expiring", label: "临近到期" }, { value: "expired", label: "已到期" }, { value: "terminated", label: "已终止" }], true),
    choiceField("currency", "币种", draft, onChange, CURRENCY_OPTIONS, true), numberField("amount", "合同金额", draft, onChange),
    textField("keyTerms", "关键条款", draft, onChange), textField("obligationSummary", "义务与承诺", draft, onChange), textField("sourceReference", "证据引用", draft, onChange),
  ];
  return [dateField("periodEnd", "报告期", draft, onChange, true), choiceField("status", "状态", draft, onChange, [{ value: "draft", label: "草稿" }, { value: "confirmed", label: "已确认" }], true),
    choiceField("currency", "币种", draft, onChange, CURRENCY_OPTIONS, true), numberField("revenue", "营业收入", draft, onChange), numberField("netProfit", "净利润", draft, onChange),
    numberField("cashBalance", "现金余额", draft, onChange), numberField("valuation", "估值", draft, onChange), numberField("headcount", "期末人数", draft, onChange),
    textField("highlights", "经营亮点", draft, onChange), textField("risks", "风险与偏差", draft, onChange), textField("sourceReference", "数据来源", draft, onChange)];
}

export const MEETING_COLUMNS: DataSurfaceColumnSpec<InvestmentEnterpriseMeetingRecord>[] = [
  { key: "title", label: "会议/事项", required: true, cell: (row) => ({ kind: "text", value: row.title, emphasis: "strong" }) },
  { key: "type", label: "类型", cell: (row) => row.meetingType === "shareholders" ? "股东会" : row.meetingType === "board" ? "董事会" : "治理会议" },
  { key: "date", label: "日期", cell: (row) => row.meetingDate ?? "待定" }, { key: "status", label: "状态", cell: (row) => row.status },
  { key: "owner", label: "跟进人", cell: (row) => row.followUpOwner ?? "—" }, { key: "due", label: "跟进期限", cell: (row) => row.followUpDueDate ?? "—" },
];
export const DILIGENCE_COLUMNS: DataSurfaceColumnSpec<InvestmentEnterpriseDiligenceRecord>[] = [
  { key: "title", label: "尽调问题", required: true, cell: (row) => ({ kind: "text", value: row.title, emphasis: "strong" }) },
  { key: "workstream", label: "领域", cell: (row) => diligenceWorkstream(row.workstream) }, { key: "risk", label: "风险等级", cell: (row) => row.riskLevel },
  { key: "status", label: "状态", cell: (row) => row.status }, { key: "owner", label: "负责人", cell: (row) => row.ownerName ?? "—" }, { key: "due", label: "期限", cell: (row) => row.dueDate ?? "—" },
];
export const CONTRACT_COLUMNS: DataSurfaceColumnSpec<InvestmentEnterpriseContractRecord>[] = [
  { key: "title", label: "合同", required: true, cell: (row) => ({ kind: "text", value: row.title, emphasis: "strong" }) },
  { key: "type", label: "类型", cell: (row) => row.contractType }, { key: "counterparty", label: "相对方", cell: (row) => row.counterpartyText ?? "—" },
  { key: "status", label: "状态", cell: (row) => row.status }, { key: "expiry", label: "到期日", cell: (row) => row.expiryDate ?? "—" }, { key: "notice", label: "提醒日", cell: (row) => row.noticeDate ?? "—" },
];
export const MONITORING_COLUMNS: DataSurfaceColumnSpec<InvestmentEnterpriseMonitoringRecord>[] = [
  { key: "period", label: "报告期", required: true, cell: (row) => ({ kind: "text", value: row.periodEnd, emphasis: "strong" }) },
  { key: "revenue", label: "营业收入", numeric: true, cell: (row) => formatAmount(row.revenue, row.currency) },
  { key: "profit", label: "净利润", numeric: true, cell: (row) => formatAmount(row.netProfit, row.currency) },
  { key: "cash", label: "现金余额", numeric: true, cell: (row) => formatAmount(row.cashBalance, row.currency) },
  { key: "valuation", label: "估值", numeric: true, cell: (row) => formatAmount(row.valuation, row.currency) }, { key: "headcount", label: "人数", numeric: true, cell: (row) => row.headcount ?? "—" },
];
export const INVESTMENT_SHAREHOLDER_COLUMNS: DataSurfaceColumnSpec<InvestmentEnterpriseShareholderRecord>[] = [
  { key: "name", label: "股东", required: true, width: "md", wrap: "nowrap", cell: (row) => ({ kind: "text", value: row.name, emphasis: "strong" }) },
  { key: "confirmedCapital", label: "当前认缴资本（万元）", numeric: true, width: "lg", wrap: "nowrap", cell: (row) => formatCapitalWan(row.confirmedSubscribedCapitalYuan) },
  { key: "shareRatio", label: "当前持股比例", numeric: true, width: "md", wrap: "nowrap", cell: (row) => row.shareRatio === null ? "—" : `${(row.shareRatio * 100).toFixed(2)}%` },
  { key: "pendingDelta", label: "待变更资本（万元）", numeric: true, width: "lg", wrap: "nowrap", cell: (row) => row.pendingCapitalDeltaYuan === null ? "金额待补" : row.pendingCapitalDeltaYuan === 0 ? "—" : ({ kind: "text", value: `${row.pendingCapitalDeltaYuan > 0 ? "+" : ""}${formatCapitalWan(row.pendingCapitalDeltaYuan)}`, tone: "warning", emphasis: "medium" }) },
  { key: "projectedCapital", label: "变更后资本（万元）", numeric: true, width: "lg", wrap: "nowrap", cell: (row) => formatCapitalWan(row.projectedSubscribedCapitalYuan) },
  { key: "period", label: "股权活动期间", width: "xl", wrap: "nowrap", cell: (row) => `${row.firstEventDate ?? "—"} 至 ${row.latestEventDate ?? "—"}` },
];
export const INVESTMENT_SHAREHOLDER_VISIBLE_COLUMNS = INVESTMENT_SHAREHOLDER_COLUMNS.map((column) => column.key);
export const DOCUMENT_COLUMNS: DataSurfaceColumnSpec<InvestmentEnterpriseDocumentRecord>[] = [
  { key: "title", label: "资料", required: true, cell: (row) => ({ kind: "group", direction: "column", items: [{ kind: "text", value: row.title, emphasis: "strong" }, { kind: "text", value: row.fileName ?? row.failureReason ?? "等待处理", tone: "muted" }] }) },
  { key: "category", label: "分类", cell: (row) => row.documentCategory }, { key: "extract", label: "解析/OCR", cell: (row) => row.ocrStatus === "not_needed" ? "原文可读" : row.ocrStatus },
  { key: "vector", label: "向量索引", cell: (row) => row.vectorStatus }, { key: "model", label: "模型", cell: (row) => row.modelKey ?? "—" }, { key: "updated", label: "更新时间", cell: (row) => row.updatedAt.slice(0, 10) },
];

export function diligenceWorkstream(value: string) {
  return ({ business: "商业", financial: "财务", legal: "法务", tax: "税务", technology: "技术", hr: "人力", esg: "ESG", compliance: "合规" } as Record<string, string>)[value] ?? value;
}
export function formatAmount(value: number | null, currency = "CNY") {
  return value === null ? "—" : `${(value / 10_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 万 ${currency}`;
}
function formatCapitalWan(value: number | null) {
  return value === null ? "—" : (value / 10_000).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
