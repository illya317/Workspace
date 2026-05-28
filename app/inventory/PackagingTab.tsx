"use client";

import InventoryTableTab, { type InventoryConfig } from "./components/InventoryTableTab";

const CONFIG: InventoryConfig = {
  title: "包装材料",
  createTitle: "新增包装材料",
  opButtonLabel: "入库/出库",
  apiBase: "/api/inventory/packaging",
  targetType: "packaging",
  fields: [
    { key: "code", label: "物料编码" },
    { key: "name", label: "物料名称" },
    { key: "spec", label: "规格型号" },
    { key: "unit", label: "单位" },
    { key: "packagingType", label: "包装类型" },
    { key: "status", label: "库存状态" },
    { key: "lastBalance", label: "上次结存" },
    { key: "currentInbound", label: "本次入库" },
    { key: "currentOutbound", label: "本次出库" },
    { key: "currentStock", label: "当前库存", isComputed: true },
    { key: "batchNo", label: "批号" },
    { key: "expiryDate", label: "有效期" },
    { key: "remark", label: "备注" },
  ],
  createFields: [
    { key: "code", label: "编码", type: "text", required: true },
    { key: "name", label: "名称", type: "text", required: true },
    { key: "spec", label: "规格", type: "text" },
    { key: "unit", label: "单位", type: "text" },
    { key: "packagingType", label: "包装类型", type: "select", options: ["小容量", "片剂包装"], defaultValue: "小容量" },
    { key: "status", label: "状态", type: "select", options: ["正常", "待检", "不合格"], defaultValue: "正常" },
  ],
  opTypes: [
    { value: "inbound", label: "采购入库" },
    { value: "outbound", label: "生产领用" },
    { value: "adjust", label: "库存调整" },
  ],
  defaultOpType: "inbound",
  calculateStock: (item) =>
    (item.lastBalance as number ?? 0) + (item.currentInbound as number ?? 0) - (item.currentOutbound as number ?? 0),
};

export default function PackagingTab() {
  return <InventoryTableTab config={CONFIG} />;
}
