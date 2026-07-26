export interface ErpDiligenceQuestion {
  key: string;
  label: string;
  prompt: string;
  control?: "choice" | "multiple";
  options?: readonly ErpDiligenceOption[];
}

export interface ErpDiligenceOption {
  value: string;
  label: string;
  description?: string;
}

export interface ErpDiligenceQuestionSection {
  key: string;
  title: string;
  description: string;
  tab: "commercial" | "fulfillment" | "finance" | "systems" | "summary";
  questions: readonly ErpDiligenceQuestion[];
}

export const ERP_DILIGENCE_TABS = [
  { key: "profile", label: "填报说明" },
  { key: "process", label: "流程与材料" },
  { key: "commercial", label: "销售与订单" },
  { key: "fulfillment", label: "交付与验收" },
  { key: "finance", label: "开票与回款" },
  { key: "systems", label: "系统与例外" },
  { key: "summary", label: "问题与需求" },
] as const;

export const ERP_DILIGENCE_AREA_OPTIONS = [
  { value: "management", label: "管理层" },
  { value: "sales", label: "销售" },
  { value: "sales_ops", label: "销售内勤" },
  { value: "delivery", label: "交付/项目" },
  { value: "warehouse", label: "仓库/物流" },
  { value: "finance_ar", label: "财务应收" },
  { value: "cashier", label: "出纳" },
  { value: "tax", label: "开票/税务" },
  { value: "legal", label: "法务/行政" },
  { value: "it", label: "IT/数据" },
  { value: "other", label: "其他" },
] as const;

export const ERP_DILIGENCE_EVIDENCE_TYPES = [
  { value: "quote", label: "报价单" },
  { value: "contract", label: "销售合同" },
  { value: "order", label: "销售订单" },
  { value: "delivery", label: "出库/发货/签收单" },
  { value: "acceptance", label: "验收记录" },
  { value: "invoice", label: "开票申请/发票台账" },
  { value: "receivable", label: "应收/账龄/对账单" },
  { value: "bank", label: "银行流水/回款核销" },
  { value: "exception", label: "退货/退款/红冲/坏账" },
  { value: "system", label: "系统或Excel清单" },
  { value: "report", label: "经营报表" },
  { value: "other", label: "其他材料" },
] as const;

export const ERP_DILIGENCE_PROCESS_MATURITY_OPTIONS = [
  { value: "not_applicable", label: "不适用" },
  { value: "unknown", label: "不清楚/需访谈" },
  { value: "offline", label: "纸面或口头为主" },
  { value: "messaging", label: "邮件/微信流转" },
  { value: "spreadsheet", label: "Excel/共享表为主" },
  { value: "isolated_system", label: "已有单点系统" },
  { value: "integrated_system", label: "已跨系统集成" },
  { value: "automated", label: "已自动执行并监控" },
] as const;

export const ERP_DILIGENCE_FREQUENCY_OPTIONS = [
  { value: "daily_many", label: "每天多次" },
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "quarterly", label: "每季或更少" },
  { value: "event_driven", label: "不定期/事件触发" },
] as const;

export const ERP_DILIGENCE_VOLUME_OPTIONS = [
  { value: "lt_10", label: "每月少于 10 笔" },
  { value: "10_50", label: "每月 10–50 笔" },
  { value: "51_200", label: "每月 51–200 笔" },
  { value: "201_1000", label: "每月 201–1000 笔" },
  { value: "gt_1000", label: "每月超过 1000 笔" },
  { value: "unknown", label: "不清楚" },
] as const;

export const ERP_DILIGENCE_TIME_OPTIONS = [
  { value: "lt_5m", label: "少于 5 分钟" },
  { value: "5_15m", label: "5–15 分钟" },
  { value: "16_30m", label: "16–30 分钟" },
  { value: "31_60m", label: "31–60 分钟" },
  { value: "1_4h", label: "1–4 小时" },
  { value: "gt_4h", label: "超过 4 小时" },
  { value: "unknown", label: "不清楚" },
] as const;

export const ERP_DILIGENCE_WAIT_OPTIONS = [
  { value: "none", label: "基本不等待" },
  { value: "lt_2h", label: "少于 2 小时" },
  { value: "same_day", label: "当天" },
  { value: "1_3d", label: "1–3 天" },
  { value: "gt_3d", label: "超过 3 天" },
  { value: "unknown", label: "不清楚" },
] as const;

export const ERP_DILIGENCE_EXECUTION_MODE_OPTIONS = [
  { value: "paper", label: "纸面/口头" },
  { value: "chat_email", label: "微信/邮件" },
  { value: "spreadsheet", label: "Excel/共享表" },
  { value: "single_system", label: "单一业务系统" },
  { value: "multi_system_manual", label: "多系统人工搬运" },
  { value: "integrated_workflow", label: "跨系统集成流程" },
  { value: "automated", label: "自动执行" },
] as const;

export const ERP_DILIGENCE_INPUT_STRUCTURE_OPTIONS = [
  { value: "structured_digital", label: "结构化数字数据" },
  { value: "semi_structured", label: "表格/半结构化文件" },
  { value: "documents", label: "合同、票据、PDF 等文档" },
  { value: "messages", label: "邮件、微信、自然语言" },
  { value: "scans", label: "扫描件/图片" },
  { value: "mixed", label: "多种格式混合" },
] as const;

export const ERP_DILIGENCE_RULE_TYPE_OPTIONS = [
  { value: "fixed", label: "规则固定清晰" },
  { value: "thresholds", label: "阈值/权限规则较多" },
  { value: "complex_rules", label: "规则复杂且经常维护" },
  { value: "context_judgment", label: "需要结合上下文判断" },
  { value: "expert_judgment", label: "依赖专业经验判断" },
] as const;

export const ERP_DILIGENCE_VARIABILITY_OPTIONS = [
  { value: "single", label: "基本只有一种路径" },
  { value: "few", label: "少量明确分支" },
  { value: "many", label: "分支较多" },
  { value: "case_by_case", label: "多数情况需个案判断" },
] as const;

export const ERP_DILIGENCE_RATE_OPTIONS = [
  { value: "lt_1", label: "少于 1%" },
  { value: "1_5", label: "1%–5%" },
  { value: "6_20", label: "6%–20%" },
  { value: "gt_20", label: "超过 20%" },
  { value: "unknown", label: "不清楚" },
] as const;

export const ERP_DILIGENCE_HANDOFF_OPTIONS = [
  { value: "same_system", label: "同一系统内流转" },
  { value: "workflow", label: "审批/工作流" },
  { value: "export_import", label: "导出再导入" },
  { value: "spreadsheet", label: "共享表/台账交接" },
  { value: "chat_email", label: "微信/邮件通知" },
  { value: "verbal_paper", label: "口头/纸面交接" },
] as const;

export const ERP_DILIGENCE_SYSTEM_COUNT_OPTIONS = [
  { value: "0", label: "不使用系统" },
  { value: "1", label: "1 个系统" },
  { value: "2_3", label: "2–3 个系统" },
  { value: "4_plus", label: "4 个及以上" },
] as const;

export const ERP_DILIGENCE_LOG_OPTIONS = [
  { value: "complete", label: "有完整状态和时间日志" },
  { value: "partial", label: "只有部分系统记录" },
  { value: "files_only", label: "只有表格/文件" },
  { value: "none", label: "基本没有可追踪记录" },
] as const;

export const ERP_DILIGENCE_RISK_OPTIONS = [
  { value: "low", label: "低：可撤回/易复核" },
  { value: "medium", label: "中：影响客户或内部运营" },
  { value: "high", label: "高：影响金额、合同或合规" },
  { value: "critical", label: "关键：不可逆或重大责任" },
] as const;

export const ERP_DILIGENCE_REVIEW_OPTIONS = [
  { value: "none", label: "无需人工复核" },
  { value: "sample", label: "抽样复核即可" },
  { value: "exception", label: "仅异常需人工确认" },
  { value: "every_case", label: "每笔都需人工批准" },
] as const;

export const ERP_DILIGENCE_PAIN_POINT_OPTIONS = [
  { value: "duplicate_entry", label: "重复录入" },
  { value: "waiting", label: "等待/催办" },
  { value: "missing_data", label: "资料缺失" },
  { value: "inconsistent_data", label: "口径或数字不一致" },
  { value: "manual_reconciliation", label: "人工核对/对账" },
  { value: "document_reading", label: "阅读/提取文档" },
  { value: "cross_system", label: "跨系统搬运" },
  { value: "exceptions", label: "例外处理多" },
  { value: "communication", label: "反复沟通确认" },
  { value: "lack_trace", label: "缺少状态与留痕" },
] as const;

export const ERP_DILIGENCE_EVIDENCE_FORMAT_OPTIONS = [
  { value: "system_record", label: "系统记录" },
  { value: "structured_file", label: "Excel/CSV" },
  { value: "document", label: "Word/PDF/合同" },
  { value: "scan_image", label: "扫描件/图片" },
  { value: "message_email", label: "微信/邮件" },
  { value: "paper", label: "纸质原件" },
] as const;

export const ERP_DILIGENCE_EVIDENCE_COMPLETENESS_OPTIONS = [
  { value: "complete", label: "完整且持续维护" },
  { value: "mostly", label: "大部分完整" },
  { value: "partial", label: "零散/部分缺失" },
  { value: "unreliable", label: "难以确认真实性" },
] as const;

export const ERP_DILIGENCE_EVIDENCE_UPDATE_OPTIONS = [
  { value: "realtime", label: "实时/随业务发生" },
  { value: "daily", label: "每日" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "ad_hoc", label: "临时整理" },
] as const;

const ERP_DILIGENCE_QUESTION_SECTION_BASE = [
  {
    key: "business-scope",
    title: "业务范围",
    description: "描述本部门实际参与的销售类型和闭环边界，不写未来设想。",
    tab: "commercial",
    questions: [
      { key: "business_models", label: "销售模式", prompt: "销售的是产品、服务、项目还是混合模式？直销、经销、出口等流程是否不同？" },
      { key: "company_scope", label: "公司与组织范围", prompt: "涉及哪些公司主体、销售团队和业务部门？是否存在跨公司签约、发货、开票或收款？" },
      { key: "customer_types", label: "客户类型", prompt: "主要客户类型有哪些？不同客户是否采用不同价格、合同、账期或交付流程？" },
      { key: "process_start_end", label: "流程起点与终点", prompt: "在你们实际工作中，销售流程从什么事件开始，到什么状态才认为真正结束？" },
    ],
  },
  {
    key: "sales-pricing",
    title: "销售、报价与价格",
    description: "关注客户、报价、价格和销售预测如何形成。",
    tab: "commercial",
    questions: [
      { key: "lead_sources", label: "线索与需求来源", prompt: "客户需求从哪里产生？由谁记录、分配和跟进？" },
      { key: "customer_master", label: "客户建档", prompt: "谁建立客户资料？如何识别重复客户、改名客户和同一集团下不同主体？" },
      { key: "quotation_process", label: "报价过程", prompt: "报价如何制作、编号、发送和留档？是否保留历史版本及有效期？" },
      { key: "pricing_rules", label: "价格与折扣", prompt: "标准价格来自哪里？哪些折扣、特价或付款条件需要审批？" },
      { key: "sales_forecast", label: "预测与赢单", prompt: "销售如何预测订单和回款？是否记录赢单、丢单及原因？" },
    ],
  },
  {
    key: "contract-order",
    title: "合同与订单",
    description: "说明合同、订单、生效、变更和关闭的真实规则。",
    tab: "commercial",
    questions: [
      { key: "contract_order_relation", label: "合同与订单关系", prompt: "一个合同能否对应多个订单？无合同时是否允许下单或发货？" },
      { key: "order_creation", label: "订单建立", prompt: "订单由谁建立、如何编号、从哪些资料抄录字段？" },
      { key: "effective_trigger", label: "生效条件", prompt: "盖章、审批、客户确认或收到预付款中的哪个事件代表订单正式生效？" },
      { key: "payment_terms", label: "付款条件", prompt: "收款节点、账期、预付款、保证金和尾款如何记录？" },
      { key: "order_change_cancel", label: "变更与取消", prompt: "价格、数量、付款条件变化或合同终止时，当前如何审批、更新和留痕？" },
    ],
  },
  {
    key: "delivery-acceptance",
    title: "发货、交付与验收",
    description: "产品销售写清批次与签收；服务项目写清里程碑与验收。",
    tab: "fulfillment",
    questions: [
      { key: "delivery_trigger", label: "发货/交付触发", prompt: "仓库或项目团队根据什么单据开始发货或交付？" },
      { key: "partial_delivery", label: "分批履约", prompt: "是否支持分批发货、分阶段交付？剩余数量或工作量在哪里跟踪？" },
      { key: "batch_evidence", label: "批次与证据", prompt: "产品、批次、数量、物流、签收或服务成果如何记录和关联订单？" },
      { key: "acceptance_rules", label: "验收规则", prompt: "哪个事件代表客户已经接受交付？客户拒绝验收时如何处理？" },
      { key: "returns_replacement", label: "退货、换货与补发", prompt: "退货、换货、补发如何申请，并如何调整库存、订单和后续应收？" },
    ],
  },
  {
    key: "invoice-receivable",
    title: "开票与应收",
    description: "区分合同收款计划、开票事实和财务应收。",
    tab: "finance",
    questions: [
      { key: "invoice_trigger", label: "开票依据", prompt: "根据合同、订单、发货还是验收申请开票？是否允许提前开票？" },
      { key: "invoice_process", label: "开票过程", prompt: "谁申请、谁审核、谁开票？发票号码、交付和红冲如何记录？" },
      { key: "collection_plan", label: "收款计划", prompt: "计划回款日如何确定、由谁维护？销售如何获得提醒？" },
      { key: "receivable_recognition", label: "应收确认", prompt: "财务应收在发货、验收还是开票后确认？记录在哪个系统？" },
      { key: "customer_reconciliation", label: "客户对账", prompt: "对账单如何生成、发送和确认？销售与财务数字不一致时如何解决？" },
    ],
  },
  {
    key: "receipt-allocation",
    title: "银行到账与核销",
    description: "说明现金事实如何被识别并关联到应收。",
    tab: "finance",
    questions: [
      { key: "bank_statement", label: "银行流水", prompt: "银行流水由谁、以什么频率下载或导入？涉及哪些收款账户？" },
      { key: "receipt_identification", label: "到账识别", prompt: "如何识别付款客户？付款人名称与合同客户不一致时怎么办？" },
      { key: "allocation_rules", label: "核销分配", prompt: "一笔到账支付多个订单，或一个订单分多次付款时如何登记？" },
      { key: "prepayment_short_over", label: "预收、短款与溢付", prompt: "无法立即匹配订单的预收款、手续费、短款和溢付如何处理？" },
      { key: "overdue_collection", label: "逾期催收", prompt: "谁负责催收？逾期多久预警、升级或停止继续发货？" },
    ],
  },
  {
    key: "exceptions-approval",
    title: "审批与例外",
    description: "列出真正需要决策的风险点，不要把所有保存动作都写成审批。",
    tab: "systems",
    questions: [
      { key: "approval_thresholds", label: "审批事项", prompt: "折扣、超信用、特殊账期、提前发货等事项由谁批准？阈值是什么？" },
      { key: "missing_document", label: "先做后补", prompt: "是否存在先发货后补合同、先开票后补订单？如何授权和补齐？" },
      { key: "refund_credit_note", label: "退款、折让与红冲", prompt: "退款、折让、红冲和客户短款由谁申请、审核和执行？" },
      { key: "bad_debt", label: "坏账与关闭", prompt: "坏账判断、核销和订单强制关闭的标准是什么？" },
    ],
  },
  {
    key: "systems-data",
    title: "系统、Excel与数据关联",
    description: "盘点所有实际工具，包括个人表格和微信群。",
    tab: "systems",
    questions: [
      { key: "systems_inventory", label: "系统与文件", prompt: "使用哪些系统、Excel、网银、微信、邮件或纸质单据？分别由谁维护？" },
      { key: "duplicate_entry", label: "重复录入", prompt: "哪些数据需要跨系统或跨表格重复录入？哪一步最耗时？" },
      { key: "document_keys", label: "关联编号", prompt: "客户、合同、订单、出库、发票和回款靠什么唯一编号关联？" },
      { key: "exports_integrations", label: "导出与接口", prompt: "各系统是否可以导出数据？格式是什么？是否已有接口或定时任务？" },
      { key: "shadow_spreadsheets", label: "影子台账", prompt: "有哪些只掌握在个人手里的关键Excel？离开这些表格会中断什么工作？" },
    ],
  },
  {
    key: "reports-problems",
    title: "报表、问题与管理需求",
    description: "从真实工作损耗和管理决策出发总结。",
    tab: "summary",
    questions: [
      { key: "current_reports", label: "现有报表", prompt: "定期制作哪些订单、发货、开票、应收、回款或预测报表？谁制作、给谁看？" },
      { key: "slow_steps", label: "最慢环节", prompt: "最耗时间、最经常等待他人的三个环节是什么？" },
      { key: "error_steps", label: "最易出错", prompt: "最容易漏单、重复、金额不一致或找不到证据的三个环节是什么？" },
      { key: "department_disputes", label: "跨部门分歧", prompt: "销售、仓库、交付和财务最常在哪些数字或状态上不一致？" },
      { key: "desired_reminders", label: "希望自动提醒", prompt: "最希望系统提醒哪些截止日、异常或待办？" },
      { key: "desired_outputs", label: "希望自动输出", prompt: "最希望系统自动生成哪些报表、对账单或管理指标？" },
      { key: "major_incidents", label: "重大异常案例", prompt: "过去一年有哪些典型损失、投诉、坏账或数据事故？请描述原因和处理过程。" },
    ],
  },
] as const satisfies readonly ErpDiligenceQuestionSection[];

const SUMMARY_QUESTION_OPTIONS: Record<string, readonly ErpDiligenceOption[]> = {
  current_reports: [
    { value: "orders", label: "订单与合同" },
    { value: "delivery", label: "发货/交付/验收" },
    { value: "invoice", label: "开票" },
    { value: "receivable", label: "应收与账龄" },
    { value: "collection", label: "回款与核销" },
    { value: "forecast", label: "销售/回款预测" },
    { value: "management", label: "经营分析" },
  ],
  slow_steps: ERP_DILIGENCE_PAIN_POINT_OPTIONS,
  error_steps: ERP_DILIGENCE_PAIN_POINT_OPTIONS,
  department_disputes: [
    { value: "customer", label: "客户主体/名称" },
    { value: "contract_order", label: "合同与订单状态" },
    { value: "quantity", label: "数量/履约进度" },
    { value: "price", label: "价格/折扣" },
    { value: "invoice", label: "开票状态" },
    { value: "receivable", label: "应收余额" },
    { value: "collection", label: "到账/核销归属" },
    { value: "ownership", label: "责任归属" },
  ],
  desired_reminders: [
    { value: "approval", label: "待审批/超时" },
    { value: "delivery", label: "交付/验收节点" },
    { value: "invoice", label: "开票条件/红冲" },
    { value: "collection", label: "到期回款/逾期" },
    { value: "missing_data", label: "资料缺失" },
    { value: "exception", label: "异常与返工" },
    { value: "reconciliation", label: "对账差异" },
  ],
  desired_outputs: [
    { value: "quote_contract", label: "报价/合同文档" },
    { value: "order_delivery", label: "订单/交付单据" },
    { value: "invoice_application", label: "开票申请" },
    { value: "reconciliation", label: "对账单" },
    { value: "aging", label: "账龄/催收清单" },
    { value: "forecast", label: "预测与滚动计划" },
    { value: "management", label: "经营看板" },
  ],
  major_incidents: [
    { value: "lost_order", label: "漏单/重复下单" },
    { value: "wrong_price", label: "价格或金额错误" },
    { value: "wrong_delivery", label: "错发/漏发/延期" },
    { value: "invoice_issue", label: "开票/红冲错误" },
    { value: "unmatched_receipt", label: "回款无法识别或错核销" },
    { value: "bad_debt", label: "逾期/坏账" },
    { value: "customer_complaint", label: "客户投诉" },
    { value: "audit_gap", label: "审计证据缺失" },
    { value: "none", label: "近一年无重大异常" },
  ],
};

export const ERP_DILIGENCE_QUESTION_SECTIONS: readonly ErpDiligenceQuestionSection[] =
  ERP_DILIGENCE_QUESTION_SECTION_BASE.map((section) => ({
    ...section,
    questions: section.questions.map((question) => {
      const summaryOptions = SUMMARY_QUESTION_OPTIONS[question.key];
      return {
        ...question,
        control: summaryOptions ? "multiple" as const : "choice" as const,
        options: summaryOptions ?? ERP_DILIGENCE_PROCESS_MATURITY_OPTIONS,
      };
    }),
  }));

export const ERP_DILIGENCE_PROCESS_ACTIVITY_OPTIONS: readonly ErpDiligenceOption[] = [
  ...ERP_DILIGENCE_QUESTION_SECTIONS
    .filter((section) => section.tab !== "summary")
    .flatMap((section) => section.questions.map((question) => ({
      value: question.key,
      label: question.label,
      description: section.title,
    }))),
  { value: "other", label: "其他流程", description: "仅在目录中没有对应活动时选择" },
];

export const ERP_DILIGENCE_QUESTION_OPTION_VALUES = new Map(
  ERP_DILIGENCE_QUESTION_SECTIONS.flatMap((section) => (
    section.questions.map((question) => [
      question.key,
      new Set((question.options ?? []).map((option) => option.value)),
    ] as const)
  )),
);

export const ERP_DILIGENCE_QUESTION_KEYS = ERP_DILIGENCE_QUESTION_SECTIONS
  .flatMap((section) => section.questions.map((question) => question.key));

export const ERP_DILIGENCE_QUESTION_COUNT = ERP_DILIGENCE_QUESTION_KEYS.length;

export function calculateErpDiligenceCompletion(input: {
  respondentName?: string;
  departmentName?: string;
  roleTitle?: string;
  primaryArea?: string;
  answers?: Record<string, string | string[]>;
  processSteps?: Array<{ activityKey?: string }>;
}) {
  const profileValues = [input.respondentName, input.departmentName, input.roleTitle, input.primaryArea];
  const profileCompleted = profileValues.filter((value) => Boolean(value?.trim())).length;
  const answered = ERP_DILIGENCE_QUESTION_KEYS.filter((key) => {
    const answer = input.answers?.[key];
    return Array.isArray(answer) ? answer.length > 0 : Boolean(answer?.trim());
  }).length;
  const processCompleted = input.processSteps?.some((step) => Boolean(step.activityKey?.trim())) ? 1 : 0;
  return Math.round(((profileCompleted + answered + processCompleted) / (ERP_DILIGENCE_QUESTION_COUNT + 5)) * 100);
}

export interface ErpDiligenceOpportunityScore {
  digitizationScore: number;
  agentScore: number;
  recommendation: "process_redesign" | "erp_workflow" | "deterministic_automation" | "agent_assist" | "agent_with_review" | "observe";
}

function scoreOf(value: string, scores: Record<string, number>) {
  return scores[value] ?? 0;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateErpDiligenceOpportunity(step: {
  frequency?: string;
  volumeBand?: string;
  touchTimeBand?: string;
  waitTimeBand?: string;
  executionMode?: string;
  inputStructure?: string;
  ruleType?: string;
  variability?: string;
  exceptionRate?: string;
  errorRate?: string;
  handoffMode?: string;
  systemCount?: string;
  logAvailability?: string;
  riskLevel?: string;
  reviewRequirement?: string;
  painPoints?: string[];
}): ErpDiligenceOpportunityScore {
  const painCount = Math.min(step.painPoints?.length ?? 0, 4);
  const digitizationScore = clampScore(
    painCount * 4
    + scoreOf(step.frequency ?? "", { daily_many: 12, daily: 10, weekly: 7, monthly: 4, event_driven: 3 })
    + scoreOf(step.volumeBand ?? "", { gt_1000: 12, "201_1000": 10, "51_200": 8, "10_50": 5, lt_10: 2 })
    + scoreOf(step.touchTimeBand ?? "", { gt_4h: 10, "1_4h": 9, "31_60m": 7, "16_30m": 5, "5_15m": 3, lt_5m: 1 })
    + scoreOf(step.waitTimeBand ?? "", { gt_3d: 10, "1_3d": 8, same_day: 5, lt_2h: 3 })
    + scoreOf(step.executionMode ?? "", { paper: 15, chat_email: 14, spreadsheet: 13, multi_system_manual: 15, single_system: 7, integrated_workflow: 3 })
    + scoreOf(step.errorRate ?? "", { gt_20: 10, "6_20": 8, "1_5": 4, lt_1: 1 })
    + scoreOf(step.systemCount ?? "", { "4_plus": 8, "2_3": 6, "1": 2 })
    + scoreOf(step.logAvailability ?? "", { complete: 7, partial: 5, files_only: 3 }),
  );
  const agentRiskPenalty = scoreOf(step.riskLevel ?? "", { medium: 5, high: 15, critical: 30 });
  const agentScore = clampScore(
    scoreOf(step.inputStructure ?? "", { structured_digital: 4, semi_structured: 10, documents: 20, messages: 22, scans: 18, mixed: 20 })
    + scoreOf(step.ruleType ?? "", { fixed: 3, thresholds: 8, complex_rules: 18, context_judgment: 25, expert_judgment: 28 })
    + scoreOf(step.variability ?? "", { single: 2, few: 6, many: 13, case_by_case: 18 })
    + scoreOf(step.exceptionRate ?? "", { lt_1: 2, "1_5": 5, "6_20": 10, gt_20: 15 })
    + scoreOf(step.handoffMode ?? "", { same_system: 2, workflow: 4, export_import: 8, spreadsheet: 8, chat_email: 12, verbal_paper: 10 })
    + painCount * 3
    + scoreOf(step.reviewRequirement ?? "", { sample: 6, exception: 9, every_case: 4 })
    - agentRiskPenalty,
  );

  const unstable = step.variability === "case_by_case" && step.ruleType === "fixed";
  let recommendation: ErpDiligenceOpportunityScore["recommendation"] = "observe";
  if (unstable || (!step.frequency && !step.executionMode)) recommendation = "process_redesign";
  else if (agentScore >= 60) recommendation = step.riskLevel === "high" || step.reviewRequirement === "every_case" ? "agent_with_review" : "agent_assist";
  else if (digitizationScore >= 65 && step.ruleType === "fixed" && step.variability !== "many") recommendation = "deterministic_automation";
  else if (digitizationScore >= 45) recommendation = "erp_workflow";

  return { digitizationScore, agentScore, recommendation };
}
