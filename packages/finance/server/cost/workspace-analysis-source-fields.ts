import type {
  WorkspaceAnalysisReadModelField,
  WorkspaceAnalysisReadModelFields,
} from "@workspace/platform/server/workspace-analysis-read-model";

import type { CostAnalysisDTO } from "./cost-analysis";
import type { CostStructureDTO } from "./cost-structure";
import type { SalesSalaryDTO } from "./sales-salary";
import type { ShipmentDTO } from "./shipments";
import type { WorkshopReportDTO } from "./workshop-reports";

type FieldKind = WorkspaceAnalysisReadModelField["valueKind"];
type Sensitivity = WorkspaceAnalysisReadModelField["sensitivity"];
type ExportPolicy = WorkspaceAnalysisReadModelField["exportPolicy"];

function field(input: {
  label: string;
  description: string;
  valueKind: FieldKind;
  sensitivity?: Sensitivity;
  exportPolicy?: ExportPolicy;
  capabilities?: WorkspaceAnalysisReadModelField["capabilities"];
}): WorkspaceAnalysisReadModelField {
  return {
    classification: "field",
    sensitivity: input.sensitivity ?? "internal",
    exportPolicy: input.exportPolicy ?? "allowed",
    ...input,
  };
}

function text(label: string, description: string, sensitivity?: Sensitivity, exportPolicy?: ExportPolicy) {
  return field({ label, description, valueKind: "text", sensitivity, exportPolicy });
}

function identifier(
  label: string,
  description: string,
  sensitivity: Sensitivity = "internal",
  exportPolicy: ExportPolicy = "allowed",
) {
  return field({
    label,
    description,
    valueKind: "integer",
    sensitivity,
    exportPolicy,
    capabilities: {
      filterOperators: ["equals", "in", "range"],
      groupable: true,
      aggregateOperations: ["count", "distinctCount"],
    },
  });
}

function period(label: string, description: string) {
  return field({
    label,
    description,
    valueKind: "integer",
    capabilities: {
      filterOperators: ["equals", "in", "range"],
      groupable: true,
      aggregateOperations: ["count", "distinctCount"],
    },
  });
}

function timestamp(label: string, description: string) {
  return field({ label, description, valueKind: "date" });
}

function number(label: string, description: string, sensitivity: Sensitivity = "internal") {
  return field({ label, description, valueKind: "number", sensitivity });
}

function amount(
  label: string,
  description: string,
  sensitivity: Sensitivity = "confidential",
  exportPolicy: ExportPolicy = "allowed",
) {
  return field({ label, description, valueKind: "currency", sensitivity, exportPolicy });
}

function sourceFields() {
  return {
    sourceFile: text("来源文件", "导入事实的来源文件名。"),
    sourceSheet: text("来源工作表", "导入事实所在工作表；来源没有工作表时为空。"),
    sourceRow: identifier("来源行号", "导入事实在来源表中的行号；无法定位时为空。"),
  };
}

export const FINANCE_SHIPMENT_ANALYSIS_FIELDS = {
  id: identifier("发货事实 ID", "发货事实的稳定系统标识。"),
  importId: identifier("导入批次 ID", "发货事实所属成本导入批次。"),
  customerId: identifier("客户 ID", "已关联客户主数据的稳定标识；未关联时为空。", "confidential"),
  productId: identifier("产品 ID", "已关联存货主数据的稳定标识；未关联时为空。"),
  employeeId: identifier("员工 ID", "已关联销售员工的稳定标识；非员工销售或未关联时为空。", "confidential"),
  salesChannel: text("销售渠道", "员工销售、厂家直销或未知归属。"),
  salespersonName: text("来源销售员", "导入来源记录的销售员名称快照。", "confidential"),
  salespersonStatus: text("销售归属状态", "销售归属是否已关联员工，或属于厂家直销、未知。"),
  customerMasterStatus: text("客户关联状态", "来源客户是否已经关联客户主数据。"),
  productMasterStatus: text("产品关联状态", "来源产品是否已经关联存货主数据。"),
  year: period("年份", "发货事实所属年份。"),
  month: period("月份", "发货事实所属月份；来源仅有年度粒度时为空。"),
  date: field({
    label: "发货日期",
    description: "来源存在日粒度时的发货日期。",
    valueKind: "date",
  }),
  customerName: text("客户", "发货来源客户名称快照。", "confidential"),
  employeeName: text("销售归属", "已关联员工姓名、厂家直销或来源销售员名称。", "confidential"),
  productName: text("存货名称", "发货来源存货名称快照。"),
  spec: text("规格型号", "发货来源规格型号快照。"),
  batchNo: text("批号", "发货来源批号。"),
  quantity: number("发货数量", "来源发货数量。"),
  unitPrice: amount("单价", "来源发货单价。"),
  amount: amount("发货金额", "来源发货含税金额本币。"),
  receivedAmount: amount("回款金额", "来源已回款金额；空值仍表示未知。"),
  unreceivedAmount: {
    classification: "omit",
    reason: "unstable",
    description: "当前 DTO 会把未知回款当作零计算未回款，口径修正前不得用于分析。",
  },
  ...sourceFields(),
  createdAt: timestamp("创建时间", "发货事实写入系统的时间。"),
  updatedAt: timestamp("更新时间", "发货事实最近更新的时间。"),
} satisfies WorkspaceAnalysisReadModelFields<ShipmentDTO>;

export const FINANCE_COST_ANALYSIS_FIELDS = {
  id: identifier("成本分析行 ID", "成本分析导入行的稳定系统标识。"),
  importId: identifier("导入批次 ID", "成本分析事实所属导入批次。"),
  year: period("年份", "成本分析行所属年份。"),
  month: period("月份", "成本分析行所属月份；年度行可为空。"),
  tableName: text("表名", "来源成本分析表名称。"),
  rowLabel: text("行项目", "来源表中的行项目名称。"),
  metricKey: text("指标键", "成本分析指标的稳定来源键。"),
  metricName: text("指标名称", "成本分析指标的来源名称。"),
  value: number("指标数值", "来源指标数值；指标口径可能是金额、数量或比例，不能统一解释为货币。", "confidential"),
  textValue: text("指标文本", "无法表示为数值时保留的来源文本。", "confidential"),
  ...sourceFields(),
  createdAt: timestamp("创建时间", "成本分析事实写入系统的时间。"),
  updatedAt: timestamp("更新时间", "成本分析事实最近更新的时间。"),
} satisfies WorkspaceAnalysisReadModelFields<CostAnalysisDTO>;

export const FINANCE_COST_STRUCTURE_FIELDS = {
  id: identifier("成本构成行 ID", "成本构成导入行的稳定系统标识。"),
  importId: identifier("导入批次 ID", "成本构成事实所属导入批次。"),
  productId: identifier("产品 ID", "已关联存货主数据的稳定标识；未关联时为空。"),
  receiptReportId: identifier("入库报单 ID", "已关联入库报单的稳定标识；未关联时为空。"),
  year: period("年份", "成本构成事实所属年份。"),
  month: period("月份", "成本构成事实所属月份。"),
  productStatus: text("产品状态", "来源表中的产成品或在产品状态。"),
  productName: text("产品名称", "成本来源产品名称快照。"),
  workHours: number("工时", "来源归集工时。"),
  rawMaterials: amount("原材料", "来源原材料成本。"),
  packagingMaterials: amount("包装材料", "来源包装材料成本。"),
  directLaborWage: amount("直接人工工资", "来源直接人工工资。"),
  directLaborSocialSecurity: amount("直接人工社保", "来源直接人工社保。"),
  directLaborWelfare: amount("直接人工福利", "来源直接人工福利。"),
  auxiliaryLaborWage: amount("辅助人工工资", "来源辅助人工工资。"),
  auxiliaryLaborSocialSecurity: amount("辅助人工社保", "来源辅助人工社保。"),
  auxiliaryLaborWelfare: amount("辅助人工福利", "来源辅助人工福利。"),
  utilities: amount("水电费", "来源水电成本。"),
  depreciationDirect: amount("直接折旧", "来源直接折旧成本。"),
  depreciationAuxiliary: amount("辅助折旧", "来源辅助折旧成本。"),
  otherManufacturingCost: amount("其他制造费用", "来源其他制造费用。"),
  quantity: number("入库数量", "来源入库数量；在产品可为空。"),
  unit: text("单位", "来源数量单位。"),
  ...sourceFields(),
  createdAt: timestamp("创建时间", "成本构成事实写入系统的时间。"),
  updatedAt: timestamp("更新时间", "成本构成事实最近更新的时间。"),
  productMasterCode: text("产品主数据编码", "当前已关联产品主数据的编码；未关联时为空。"),
  productMasterName: text("产品主数据名称", "当前已关联产品主数据的名称；未关联时为空。"),
  product: {
    classification: "omit",
    reason: "derivedDuplicate",
    description: "公开 DTO 的产品对象已等价展开为 productId、productMasterCode 与 productMasterName。",
  },
  receiptReport: {
    classification: "omit",
    reason: "nonScalar",
    description: "公开 DTO 的入库报单是嵌套对象；本源保留 receiptReportId 与关联状态，报单字段应由入库读模型承载。",
  },
  manufacturingSubtotal: amount("制造费用小计", "服务按制造费用叶子项实时计算的小计。"),
  unitCost: amount("单位成本", "服务以总成本除以有效入库数量实时计算；数量为空或不大于零时为空。"),
  productMasterStatus: text("产品关联状态", "来源产品是否已关联存货主数据。"),
  receiptReportStatus: text("入库报单状态", "已关联入库报单的当前状态；未关联时为空。"),
} satisfies WorkspaceAnalysisReadModelFields<CostStructureDTO>;

const salary = (label: string, description: string) => amount(label, description, "restricted", "forbidden");
const salaryPerson = (label: string, description: string) => text(label, description, "restricted", "forbidden");

export const FINANCE_SALES_SALARY_FIELDS = {
  id: identifier("工资事实 ID", "销售工资事实的稳定系统标识。"),
  importId: identifier("导入批次 ID", "销售工资事实所属成本导入批次。"),
  year: period("年份", "销售工资事实所属年份。"),
  month: period("月份", "销售工资事实所属月份。"),
  employeeId: identifier("员工 ID", "已关联销售员工的稳定标识；非员工销售或未关联时为空。", "restricted", "forbidden"),
  salesChannel: text("销售渠道", "员工销售、厂家直销或未知归属。"),
  salespersonName: salaryPerson("来源销售员", "导入来源记录的销售员名称快照。"),
  employeeName: salaryPerson("销售归属", "已关联员工姓名、厂销归集或来源销售员名称。"),
  baseSalary: salary("基本工资", "来源基本工资金额。"),
  bonus: salary("奖金", "来源奖金金额。"),
  deduction: salary("扣款", "来源扣款金额。"),
  actualSalary: salary("实发工资", "来源实发工资金额。"),
  ...sourceFields(),
  createdAt: timestamp("创建时间", "销售工资事实写入系统的时间。"),
  updatedAt: timestamp("更新时间", "销售工资事实最近更新的时间。"),
} satisfies WorkspaceAnalysisReadModelFields<SalesSalaryDTO>;

export const FINANCE_WORKSHOP_REPORT_FIELDS = {
  id: identifier("车间报表行 ID", "历史车间报表事实的稳定系统标识。"),
  importId: identifier("导入批次 ID", "车间报表事实所属成本导入批次。"),
  year: period("年份", "车间报表事实所属年份。"),
  month: period("月份", "车间报表事实所属月份。"),
  productName: text("产品名称", "车间报表中的来源产品名称快照。"),
  batchNo: text("批号", "车间报表中的来源生产批号。"),
  workPoint: field({
    label: "工分",
    description: "车间报表记录的来源工分。",
    valueKind: "number",
    sensitivity: "restricted",
    exportPolicy: "forbidden",
  }),
  quantity: number("完成数量", "车间报表记录的来源完成数量。"),
  employeeId: identifier("员工 ID", "已关联员工的稳定标识；未关联时为空。", "restricted", "forbidden"),
  positionId: identifier("岗位 ID", "已关联岗位的稳定标识；未关联时为空。", "restricted", "forbidden"),
  ...sourceFields(),
  createdAt: timestamp("创建时间", "车间报表事实写入系统的时间。"),
  updatedAt: timestamp("更新时间", "车间报表事实最近更新的时间。"),
} satisfies WorkspaceAnalysisReadModelFields<WorkshopReportDTO>;
