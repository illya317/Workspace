"use client";

import InventoryTableTab, { type InventoryConfig } from "./components/InventoryTableTab";

const CONFIG: InventoryConfig = {
  title: "原辅料",
  createTitle: "新增原辅料",
  opButtonLabel: "入库/出库",
  apiBase: "/api/inventory/raw-materials",
  targetType: "raw_material",
  fields: [
    { key: "code", label: "物料编码" },
    { key: "name", label: "物料名称" },
    { key: "spec", label: "规格型号" },
    { key: "unit", label: "单位" },
    { key: "manufacturer", label: "生产厂家" },
    { key: "status", label: "库存状态" },
    { key: "lastBalance", label: "上次结存" },
    { key: "currentPurchase", label: "本次购进" },
    { key: "currentConsume", label: "本次耗用" },
    { key: "currentStock", label: "当前库存", isComputed: true },
    { key: "remark", label: "备注" },
  ],
  createFields: [
    { key: "code", label: "编码", type: "text", required: true },
    { key: "name", label: "名称", type: "text", required: true },
    { key: "spec", label: "规格", type: "text" },
    { key: "unit", label: "单位", type: "text" },
    { key: "manufacturer", label: "厂家", type: "text" },
    { key: "status", label: "状态", type: "select", options: ["正常", "暂未生产", "待验证"], defaultValue: "正常" },
  ],
  opTypes: [
    { value: "purchase", label: "采购入库" },
    { value: "consume", label: "生产领用" },
    { value: "adjust", label: "库存调整" },
  ],
  defaultOpType: "purchase",
  calculateStock: (item) =>
    (item.lastBalance as number ?? 0) + (item.currentPurchase as number ?? 0) - (item.currentConsume as number ?? 0),
};

export default function RawMaterialTab() {
  return <InventoryTableTab config={CONFIG} />;
}
