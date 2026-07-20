export interface ErpDiligenceQuestion {
  key: string;
  label: string;
  prompt: string;
}

export interface ErpDiligenceQuestionSection {
  key: string;
  title: string;
  description: string;
  tab: "commercial" | "fulfillment" | "finance" | "systems" | "summary";
  questions: readonly ErpDiligenceQuestion[];
}

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

export const ERP_DILIGENCE_QUESTION_SECTIONS = [
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

export const ERP_DILIGENCE_QUESTION_KEYS = ERP_DILIGENCE_QUESTION_SECTIONS
  .flatMap((section) => section.questions.map((question) => question.key));

export const ERP_DILIGENCE_QUESTION_COUNT = ERP_DILIGENCE_QUESTION_KEYS.length;

export function calculateErpDiligenceCompletion(input: {
  respondentName?: string;
  departmentName?: string;
  roleTitle?: string;
  primaryArea?: string;
  answers?: Record<string, string>;
  processSteps?: Array<{ name?: string }>;
}) {
  const profileValues = [input.respondentName, input.departmentName, input.roleTitle, input.primaryArea];
  const profileCompleted = profileValues.filter((value) => Boolean(value?.trim())).length;
  const answered = ERP_DILIGENCE_QUESTION_KEYS.filter((key) => Boolean(input.answers?.[key]?.trim())).length;
  const processCompleted = input.processSteps?.some((step) => Boolean(step.name?.trim())) ? 1 : 0;
  return Math.round(((profileCompleted + answered + processCompleted) / (ERP_DILIGENCE_QUESTION_COUNT + 5)) * 100);
}
