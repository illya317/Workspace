import type {
  CreateSurfaceSectionSpec,
  FormSurfaceFieldSpec,
  FormSurfaceItemSpec,
} from "@workspace/core/ui";
import type {
  InvestorDueDiligenceRecord,
  InvestorShareholderProfileRecord,
  ShareholderPosition,
} from "../types";

export type InvestorShareholderProfileDraft = Omit<InvestorShareholderProfileRecord, "id" | "issuerCompanyId" | "shareholderPartyId" | "version"> & {
  id?: number;
  issuerCompanyId: number;
  shareholderPartyId: number;
  version: number | null;
};

export type InvestorDueDiligenceDraft = Omit<InvestorDueDiligenceRecord, "id" | "version"> & {
  id?: number;
  version?: number;
};

export const DILIGENCE_STATUS_LABELS: Record<InvestorDueDiligenceRecord["status"], string> = {
  planned: "已安排",
  in_progress: "进行中",
  completed: "已完成",
  cancelled: "已取消",
};

export function emptyInvestorDueDiligenceDraft(issuerCompanyId: number, diligenceDate: string): InvestorDueDiligenceDraft {
  return {
    issuerCompanyId,
    investorPartyId: null,
    investorOrganization: "",
    visitorName: "",
    visitorTitle: null,
    phone: null,
    email: null,
    diligenceDate,
    diligenceType: "comprehensive",
    visitMethod: "onsite",
    status: "planned",
    hostName: null,
    ndaStatus: "pending",
    dataRoomStatus: "not_opened",
    focusAreas: null,
    followUpAction: null,
    nextFollowUpDate: null,
    notes: null,
  };
}

export function shareholderProfileDraft(
  shareholder: ShareholderPosition,
  issuerCompanyId: number,
): InvestorShareholderProfileDraft {
  return shareholder.profile ? { ...shareholder.profile } : {
    issuerCompanyId,
    shareholderPartyId: shareholder.partyId,
    investorCategory: shareholder.subjectType === "individual" ? "individual" : null,
    contactName: null,
    contactTitle: null,
    phone: null,
    email: null,
    address: null,
    relationshipOwner: null,
    relationshipStatus: "active",
    communicationPreference: null,
    notes: null,
    version: null,
  };
}

export function shareholderProfileFormSections(
  shareholder: ShareholderPosition,
  draft: InvestorShareholderProfileDraft,
  onChange: <K extends keyof InvestorShareholderProfileDraft>(key: K, value: InvestorShareholderProfileDraft[K]) => void,
  editable: boolean,
): CreateSurfaceSectionSpec<FormSurfaceItemSpec>[] {
  const text = (
    key: keyof InvestorShareholderProfileDraft,
    label: string,
    options?: { span?: 1 | 2 | 3 | 4 | 6; multiline?: boolean; hint?: string },
  ): FormSurfaceFieldSpec => ({
    key: String(key),
    label,
    span: options?.span,
    hint: options?.hint,
    spec: {
      valueType: "string",
      control: "text",
      multiline: options?.multiline,
      state: editable ? "normal" : "disabled",
    },
    value: draft[key] == null ? "" : String(draft[key]),
    rows: options?.multiline ? 3 : undefined,
    autoGrow: options?.multiline,
    onChange: (value) => onChange(key, (String(value ?? "").trim() || null) as InvestorShareholderProfileDraft[typeof key]),
  });
  const choice = <K extends "investorCategory" | "relationshipStatus">(
    key: K,
    label: string,
    options: Array<{ value: NonNullable<InvestorShareholderProfileDraft[K]>; label: string }>,
  ): FormSurfaceFieldSpec => ({
    key,
    label,
    spec: {
      valueType: "string",
      control: "choice",
      state: editable ? "normal" : "disabled",
      options: { source: "static", items: options, visibleCount: options.length },
    },
    value: draft[key] ?? "",
    onChange: (value) => onChange(key, (String(value) || null) as InvestorShareholderProfileDraft[K]),
  });
  return [
    {
      key: "shareholder-identity",
      title: "主体与持股口径",
      layout: { columns: 2, density: "compact" },
      items: [
        { kind: "readonly", key: "name", label: "股东名称", value: shareholder.name },
        { kind: "readonly", key: "subjectType", label: "主体类型", value: shareholder.subjectType === "individual" ? "个人" : "机构" },
        { kind: "readonly", key: "fullName", label: "法定全称", value: shareholder.fullName || shareholder.name },
        { kind: "readonly", key: "identity", label: "证件标识", value: shareholder.identityNumberMasked || "未登记" },
        { kind: "readonly", key: "legalRepresentative", label: "法定代表人", value: shareholder.legalRepresentative || "不适用 / 未登记" },
        { kind: "readonly", key: "shareRatio", label: "当前持股比例", value: formatPercent(shareholder.shareRatio) },
        { kind: "readonly", key: "confirmedCapital", label: "当前认缴资本", value: `${formatWanYuan(shareholder.confirmedSubscribedCapitalYuan)} 万元` },
        { kind: "readonly", key: "activityPeriod", label: "股权活动期间", value: `${shareholder.firstEventDate ?? "—"} 至 ${shareholder.latestEventDate ?? "—"}` },
      ],
    },
    {
      key: "relationship-profile",
      title: "联系与关系维护",
      layout: { columns: 2, density: "compact" },
      items: [
        choice("investorCategory", "投资人类别", [
          { value: "founder", label: "创始股东" },
          { value: "employee_platform", label: "员工持股平台" },
          { value: "institutional", label: "机构投资人" },
          { value: "strategic", label: "战略投资人" },
          { value: "financial", label: "财务投资人" },
          { value: "individual", label: "个人投资人" },
          { value: "other", label: "其他" },
        ]),
        choice("relationshipStatus", "关系状态", [
          { value: "priority", label: "重点维护" },
          { value: "active", label: "正常维护" },
          { value: "monitoring", label: "持续关注" },
          { value: "dormant", label: "暂缓联系" },
        ]),
        text("contactName", "主要联系人"),
        text("contactTitle", "联系人职务"),
        text("phone", "联系电话"),
        text("email", "联系邮箱"),
        text("relationshipOwner", "内部关系负责人", { hint: "负责日常沟通、会议和后续事项的公司联系人" }),
        text("communicationPreference", "沟通偏好", { hint: "如邮件、电话、微信或定期会议" }),
        text("address", "联系地址", { span: 2 }),
        text("notes", "关系备注", { span: 2, multiline: true }),
      ],
    },
  ];
}

export function dueDiligenceFormSections(
  draft: InvestorDueDiligenceDraft,
  shareholders: ShareholderPosition[],
  onChange: <K extends keyof InvestorDueDiligenceDraft>(key: K, value: InvestorDueDiligenceDraft[K]) => void,
  editable: boolean,
): CreateSurfaceSectionSpec<FormSurfaceFieldSpec>[] {
  const text = (
    key: keyof InvestorDueDiligenceDraft,
    label: string,
    options?: { required?: boolean; span?: 1 | 2 | 3 | 4 | 6; multiline?: boolean; hint?: string },
  ): FormSurfaceFieldSpec => ({
    key: String(key),
    label,
    required: options?.required,
    span: options?.span,
    hint: options?.hint,
    spec: {
      valueType: "string",
      control: "text",
      multiline: options?.multiline,
      state: editable ? "normal" : "disabled",
      validation: options?.required ? { required: true } : undefined,
    },
    value: draft[key] == null ? "" : String(draft[key]),
    rows: options?.multiline ? 3 : undefined,
    autoGrow: options?.multiline,
    onChange: (value) => onChange(key, (String(value ?? "").trim() || null) as InvestorDueDiligenceDraft[typeof key]),
  });
  const choice = <K extends keyof InvestorDueDiligenceDraft>(
    key: K,
    label: string,
    options: Array<{ value: string; label: string }>,
  ): FormSurfaceFieldSpec => ({
    key: String(key),
    label,
    spec: {
      valueType: "string",
      control: "choice",
      state: editable ? "normal" : "disabled",
      options: { source: "static", items: options, visibleCount: Math.min(options.length, 8) },
    },
    value: draft[key] == null ? "" : String(draft[key]),
    onChange: (value) => onChange(key, String(value) as unknown as InvestorDueDiligenceDraft[K]),
  });
  return [
    {
      key: "diligence-visitor",
      title: "来访人与安排",
      layout: { columns: 2, density: "compact" },
      items: [
        {
          key: "investorPartyId",
          label: "关联现有股东",
          hint: "潜在投资人可留空，直接填写投资机构",
          spec: {
            valueType: "string",
            control: "choice",
            state: editable ? "normal" : "disabled",
            options: {
              source: "static",
              items: [
                { value: "", label: "不关联现有股东" },
                ...shareholders.map((shareholder) => ({
                  value: String(shareholder.partyId),
                  label: shareholder.name,
                  subtitle: shareholder.fullName || undefined,
                })),
              ],
              visibleCount: Math.min(shareholders.length + 1, 8),
            },
          },
          value: draft.investorPartyId ? String(draft.investorPartyId) : "",
          onChange: (value) => {
            const partyId = Number(value);
            const shareholder = shareholders.find((item) => item.partyId === partyId);
            onChange("investorPartyId", shareholder?.partyId ?? null);
            if (shareholder) onChange("investorOrganization", shareholder.fullName || shareholder.name);
          },
        },
        text("investorOrganization", "投资机构 / 所属单位", { required: true }),
        text("visitorName", "尽调人员", { required: true }),
        text("visitorTitle", "职务 / 角色"),
        text("phone", "联系电话"),
        text("email", "联系邮箱"),
        {
          key: "diligenceDate",
          label: "尽调日期",
          required: true,
          spec: { valueType: "date", control: "temporal", precision: "date", state: editable ? "normal" : "disabled", validation: { required: true } },
          value: draft.diligenceDate,
          onChange: (value) => onChange("diligenceDate", String(value ?? "")),
        },
        choice("visitMethod", "尽调方式", [
          { value: "onsite", label: "现场" },
          { value: "remote", label: "远程" },
          { value: "hybrid", label: "混合" },
        ]),
        choice("diligenceType", "尽调类型", [
          { value: "comprehensive", label: "综合尽调" },
          { value: "business", label: "业务尽调" },
          { value: "financial", label: "财务尽调" },
          { value: "legal", label: "法律尽调" },
          { value: "technical", label: "技术尽调" },
          { value: "hr", label: "人力尽调" },
          { value: "esg", label: "ESG 尽调" },
          { value: "other", label: "其他" },
        ]),
        choice("status", "当前状态", Object.entries(DILIGENCE_STATUS_LABELS).map(([value, label]) => ({ value, label }))),
        text("hostName", "内部对接人", { hint: "负责接待、资料协调和问题闭环的公司联系人" }),
      ],
    },
    {
      key: "diligence-governance",
      title: "保密、资料与跟进",
      layout: { columns: 2, density: "compact" },
      items: [
        choice("ndaStatus", "保密协议", [
          { value: "pending", label: "待签署" },
          { value: "signed", label: "已签署" },
          { value: "not_required", label: "无需签署" },
        ]),
        choice("dataRoomStatus", "资料室权限", [
          { value: "not_opened", label: "未开放" },
          { value: "open", label: "已开放" },
          { value: "closed", label: "已关闭" },
        ]),
        text("focusAreas", "尽调范围 / 重点问题", { span: 2, multiline: true }),
        text("followUpAction", "后续事项", { span: 2, multiline: true }),
        {
          key: "nextFollowUpDate",
          label: "下次跟进日期",
          spec: { valueType: "date", control: "temporal", precision: "date", state: editable ? "normal" : "disabled" },
          value: draft.nextFollowUpDate,
          onChange: (value) => onChange("nextFollowUpDate", value ? String(value) : null),
        },
        text("notes", "备注", { span: 2, multiline: true }),
      ],
    },
  ];
}
