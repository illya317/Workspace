"use client";

import InventoryTableTab, { type InventoryConfig } from "./components/InventoryTableTab";

const CONFIG: InventoryConfig = {
  title: "成品",
  createTitle: "新增成品",
  opButtonLabel: "入库/出库",
  apiBase: "/api/inventory/finished-goods",
  targetType: "finished_goods",
  fields: [
    { key: "code", label: "成品编码" },
    { key: "name", label: "成品名称" },
    { key: "packagingSpec", label: "包装规格" },
    { key: "unit", label: "单位" },
    { key: "stockType", label: "库存类型" },
    { key: "lastBalance", label: "上次结存" },
    { key: "currentInbound", label: "本次入库" },
    { key: "currentOutbound", label: "本次发货" },
    { key: "currentStock", label: "当前库存", isComputed: true },
    { key: "availableStock", label: "可发货库存" },
    { key: "remark", label: "备注" },
  ],
  createFields: [
    { key: "code", label: "编码", type: "text", required: true },
    { key: "name", label: "名称", type: "text", required: true },
    { key: "packagingSpec", label: "包装规格", type: "text" },
    { key: "unit", label: "单位", type: "text" },
    { key: "stockType", label: "库存类型", type: "select", options: ["正常库存", "退货", "验证产品"], defaultValue: "正常库存", span: "full" },
  ],
  opTypes: [
    { value: "inbound", label: "生产入库" },
    { value: "outbound", label: "销售发货" },
    { value: "adjust", label: "库存调整" },
  ],
  defaultOpType: "inbound",
  calculateStock: (item) =>
    (item.lastBalance as number ?? 0) + (item.currentInbound as number ?? 0) - (item.currentOutbound as number ?? 0),
};

export default function FinishedGoodsTab() {
  return <InventoryTableTab config={CONFIG} />;
}
