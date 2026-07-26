import { prisma } from "@workspace/platform/server/prisma";
import type { CostQueryParams, PaginatedResult, ShipmentQueryParams } from "./common";
import { buildPagination, buildShipmentWhere } from "./common";
import { resolveShipmentDepartmentScope } from "./shipment-department-scope";

export interface ShipmentDTO {
  id: number;
  importId: number;
  customerId: number | null;
  productId: number | null;
  employeeId: number | null;
  salesChannel: "employee" | "factory_direct" | "unknown";
  salespersonName: string | null;
  salespersonStatus: "linked" | "unlinked" | "factory_direct" | "unknown";
  customerMasterStatus: "linked" | "unlinked";
  productMasterStatus: "linked" | "unlinked";
  year: number;
  month: number | null;
  date: string | null;
  customerName: string | null;
  employeeName: string | null;
  productName: string | null;
  spec: string | null;
  batchNo: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  receivedAmount: number | null;
  unreceivedAmount: number | null;
  sourceFile: string;
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDTO(row: {
  id: number;
  importId: number;
  customerId: number | null;
  productId: number | null;
  employeeId: number | null;
  salesChannel: string;
  salespersonName: string | null;
  year: number;
  month: number | null;
  date: string | null;
  customerName: string | null;
  employee: { name: string } | null;
  productName: string | null;
  spec: string | null;
  batchNo: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  receivedAmount: number | null;
  sourceFile: string;
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: Date;
  updatedAt: Date;
}): ShipmentDTO {
  const amount = row.amount ?? 0;
  const received = row.receivedAmount ?? 0;
  return {
    id: row.id,
    importId: row.importId,
    customerId: row.customerId,
    productId: row.productId,
    employeeId: row.employeeId,
    salesChannel: normalizeSalesChannel(row.salesChannel),
    salespersonName: row.salespersonName,
    salespersonStatus: salesAttributionStatus(row),
    customerMasterStatus: row.customerId === null ? "unlinked" : "linked",
    productMasterStatus: row.productId === null ? "unlinked" : "linked",
    year: row.year,
    month: row.month,
    date: row.date,
    customerName: row.customerName,
    employeeName: salesAttributionLabel(row),
    productName: row.productName,
    spec: row.spec,
    batchNo: row.batchNo,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    amount: row.amount,
    receivedAmount: row.receivedAmount,
    unreceivedAmount: amount - received,
    sourceFile: row.sourceFile,
    sourceSheet: row.sourceSheet,
    sourceRow: row.sourceRow,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeSalesChannel(value: string): "employee" | "factory_direct" | "unknown" {
  return value === "employee" || value === "factory_direct" ? value : "unknown";
}

function salesAttributionStatus(row: {
  salesChannel: string;
  employeeId: number | null;
}): ShipmentDTO["salespersonStatus"] {
  if (row.salesChannel === "factory_direct") return "factory_direct";
  if (row.salesChannel !== "employee") return "unknown";
  return row.employeeId === null ? "unlinked" : "linked";
}

function salesAttributionLabel(row: {
  salesChannel: string;
  salespersonName: string | null;
  employee: { name: string } | null;
}) {
  if (row.salesChannel === "factory_direct") return "厂家直销";
  if (row.salesChannel === "employee") return row.employee?.name ?? row.salespersonName;
  return row.salespersonName;
}

export async function listShipments(
  params: ShipmentQueryParams,
): Promise<PaginatedResult<ShipmentDTO>> {
  const scopedParams = await resolveShipmentDepartmentScope(params);
  const where = buildShipmentWhere(scopedParams);
  const { skip, take, page, pageSize } = buildPagination(params);
  const sortBy = params.sortBy ?? "date";
  const sortOrder = params.sortOrder ?? "desc";
  const primaryOrder = { [sortBy]: sortOrder } as Record<string, "asc" | "desc">;

  const [data, total] = await Promise.all([
    prisma.financeShipment.findMany({
      where,
      include: { employee: { select: { name: true } } },
      orderBy: [primaryOrder, { id: "desc" }],
      skip,
      take,
    }),
    prisma.financeShipment.count({ where }),
  ]);

  return {
    data: data.map(toDTO),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getShipmentSummary(params: CostQueryParams) {
  const where = buildShipmentWhere(params);

  const rows = await prisma.financeShipment.findMany({
    where,
    select: {
      amount: true,
      receivedAmount: true,
      customerName: true,
      salesChannel: true,
      salespersonName: true,
      employeeId: true,
      productName: true,
      employee: { select: { name: true } },
    },
  });

  let totalAmount = 0;
  let totalReceived = 0;
  const customerMap = new Map<string, number>();
  const employeeMap = new Map<string, number>();
  const productMap = new Map<string, number>();

  for (const row of rows) {
    const amt = row.amount ?? 0;
    const rec = row.receivedAmount ?? 0;
    totalAmount += amt;
    totalReceived += rec;

    if (row.customerName) {
      customerMap.set(row.customerName, (customerMap.get(row.customerName) ?? 0) + amt);
    }
    const employeeName = salesAttributionLabel(row) ?? "未注明销售归属";
    employeeMap.set(employeeName, (employeeMap.get(employeeName) ?? 0) + amt);
    if (row.productName) {
      productMap.set(row.productName, (productMap.get(row.productName) ?? 0) + amt);
    }
  }

  const sortMap = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));

  return {
    totalAmount,
    totalReceived,
    totalUnreceived: totalAmount - totalReceived,
    collectionRate: totalAmount > 0 ? totalReceived / totalAmount : 0,
    topCustomers: sortMap(customerMap),
    topEmployees: sortMap(employeeMap),
    topProducts: sortMap(productMap),
  };
}
