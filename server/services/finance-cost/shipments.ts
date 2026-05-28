import { prisma } from "@/lib/prisma";
import type { CostQueryParams, PaginatedResult } from "./common";
import { buildPagination, buildYearMonthWhere } from "./common";

export interface ShipmentDTO {
  id: number;
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
}

function toDTO(row: {
  id: number;
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
}): ShipmentDTO {
  const amount = row.amount ?? 0;
  const received = row.receivedAmount ?? 0;
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    date: row.date,
    customerName: row.customerName,
    employeeName: row.employee?.name ?? null,
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
  };
}

export async function listShipments(
  params: CostQueryParams,
): Promise<PaginatedResult<ShipmentDTO>> {
  const where = buildYearMonthWhere(params);
  const { skip, take, page, pageSize } = buildPagination(params);

  const [data, total] = await Promise.all([
    prisma.financeShipment.findMany({
      where,
      include: { employee: { select: { name: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }, { date: "desc" }],
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
  const where = buildYearMonthWhere(params);

  const rows = await prisma.financeShipment.findMany({
    where,
    select: {
      amount: true,
      receivedAmount: true,
      customerName: true,
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
    const employeeName = row.employee?.name ?? "厂家直销";
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
