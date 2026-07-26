import * as XLSX from "xlsx";

import type { FinancingRound, InvestorRelationshipView } from "../types";

type WorkbookRow = Array<string | number | Date | null>;

type FinancingLayout = {
  dateRow: number;
  registeredBeforeRow: number;
  registeredAfterRow: number;
  pricedCapitalRow: number;
  unitPriceRow: number;
  preMoneyRow: number;
  contributionStartRow: number;
  contributionEndRow: number;
  totalConsiderationRow: number;
  postMoneyRow: number;
};

export function buildCaptableWorkbook(view: InvestorRelationshipView): Buffer {
  const rounds = view.captableRounds;
  const rows: WorkbookRow[] = [];
  const titleRow: WorkbookRow = [view.selectedCompany?.name ?? "股东"];
  const dateRow: WorkbookRow = ["生效日期"];
  const fieldRow: WorkbookRow = ["认缴资本"];
  for (const round of rounds) {
    titleRow.push(`${round.label}${round.recordStatus === "pending" ? "（待变更）" : ""}`, null);
    dateRow.push(toWorkbookDate(round.effectiveDate), null);
    fieldRow.push("认缴资本（元）", "持股比例");
  }
  rows.push(titleRow, dateRow, fieldRow);
  for (const shareholder of view.captableRows) {
    const row: WorkbookRow = [shareholder.name];
    for (const round of rounds) {
      const position = shareholder.positions.find((item) => item.eventId === round.eventId);
      row.push(
        position?.isPresent ? position.subscribedCapitalYuan : null,
        position?.isPresent ? position.shareRatio : null,
      );
    }
    rows.push(row);
  }
  const totalRowIndex = rows.length;
  rows.push(["注册资本合计"]);
  const financingLayout = appendFinancingRows(rows, view.financingRounds);
  const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  sheet["!merges"] = rounds.map((_, index) => ({
    s: { r: 0, c: 1 + index * 2 },
    e: { r: 0, c: 2 + index * 2 },
  }));
  for (let index = 0; index < rounds.length; index += 1) {
    const amountColumn = 1 + index * 2;
    const ratioColumn = amountColumn + 1;
    const firstDataRow = 4;
    const lastDataRow = totalRowIndex;
    const totalExcelRow = totalRowIndex + 1;
    const amountLetter = XLSX.utils.encode_col(amountColumn);
    const ratioLetter = XLSX.utils.encode_col(ratioColumn);
    const round = rounds[index];
    const positions = view.captableRows
      .map((row) => row.positions.find((position) => position.eventId === round?.eventId))
      .filter((position) => position?.isPresent);
    const amountsComplete = positions.every((position) => position?.subscribedCapitalYuan !== null);
    const ratiosComplete = positions.every((position) => position?.shareRatio !== null);
    const amountTotalCell = XLSX.utils.encode_cell({ r: totalRowIndex, c: amountColumn });
    const ratioTotalCell = XLSX.utils.encode_cell({ r: totalRowIndex, c: ratioColumn });
    if (round?.totalRegisteredCapitalYuan !== null && round?.totalRegisteredCapitalYuan !== undefined) {
      sheet[amountTotalCell] = {
        t: "n",
        ...(amountsComplete ? { f: `SUM(${amountLetter}${firstDataRow}:${amountLetter}${lastDataRow})` } : {}),
        v: round.totalRegisteredCapitalYuan,
        z: "#,##0.00",
      };
    }
    if (ratiosComplete && positions.length > 0) {
      sheet[ratioTotalCell] = {
        t: "n",
        f: `SUM(${ratioLetter}${firstDataRow}:${ratioLetter}${lastDataRow})`,
        v: 1,
        z: "0.00%",
      };
    }
    for (let rowIndex = 3; rowIndex < totalRowIndex; rowIndex += 1) {
      const amountCell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: amountColumn })];
      if (amountCell && typeof amountCell.v === "number") amountCell.z = "#,##0.00";
      const ratioCell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: ratioColumn })];
      if (ratioCell && amountCell && typeof amountCell.v === "number") {
        ratioCell.f = `IFERROR(${amountLetter}${rowIndex + 1}/${amountLetter}${totalExcelRow},0)`;
        ratioCell.z = "0.00%";
      }
    }
    const dateCell = sheet[XLSX.utils.encode_cell({ r: 1, c: amountColumn })];
    if (dateCell) dateCell.z = "yyyy-mm-dd";
  }
  sheet["!cols"] = [{ wch: 24 }, ...rounds.flatMap(() => [{ wch: 16 }, { wch: 12 }])];
  sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({ r: 2, c: 0 }, { r: totalRowIndex, c: Math.max(0, rounds.length * 2) }),
  };
  applyFinancingFormulas(sheet, view.financingRounds, financingLayout);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "股权结构表");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function appendFinancingRows(
  rows: WorkbookRow[],
  rounds: FinancingRound[],
): FinancingLayout | null {
  if (rounds.length === 0) return null;
  const contributors = new Map<number, string>();
  for (const round of rounds) {
    for (const contribution of round.contributions) {
      contributors.set(contribution.partyId, contribution.partyName);
    }
  }
  rows.push([]);
  rows.push(["估值 / 出资", ...rounds.map((round) => (
    `${round.label}${round.recordStatus === "pending" ? "（待变更）" : ""}`
  ))]);
  const dateRow = rows.push(["生效日期", ...rounds.map((round) => toWorkbookDate(round.effectiveDate))]) - 1;
  rows.push(["资金性质", ...rounds.map((round) => round.kind === "primary" ? "公司增资" : "股权转让")]);
  const registeredBeforeRow = rows.push([
    "投前注册资本（元）",
    ...rounds.map((round) => round.registeredCapitalBeforeYuan),
  ]) - 1;
  const registeredAfterRow = rows.push([
    "投后注册资本（元）",
    ...rounds.map((round) => round.registeredCapitalAfterYuan),
  ]) - 1;
  const pricedCapitalRow = rows.push([
    "新增 / 转让认缴资本（元）",
    ...rounds.map((round) => round.pricedRegisteredCapitalYuan),
  ]) - 1;
  const unitPriceRow = rows.push(["每 1 元注册资本价格（元）"]) - 1;
  const preMoneyRow = rows.push(["投前 / 隐含估值（元）"]) - 1;
  const contributionStartRow = rows.length;
  for (const [partyId, partyName] of contributors) {
    rows.push([
      partyName,
      ...rounds.map((round) => (
        round.contributions.find((item) => item.partyId === partyId)?.considerationAmountYuan ?? null
      )),
    ]);
  }
  const contributionEndRow = rows.length - 1;
  const totalConsiderationRow = rows.push(["本轮资金合计（元）"]) - 1;
  const postMoneyRow = rows.push(["投后估值（元）"]) - 1;
  return {
    dateRow,
    registeredBeforeRow,
    registeredAfterRow,
    pricedCapitalRow,
    unitPriceRow,
    preMoneyRow,
    contributionStartRow,
    contributionEndRow,
    totalConsiderationRow,
    postMoneyRow,
  };
}

function applyFinancingFormulas(
  sheet: XLSX.WorkSheet,
  rounds: FinancingRound[],
  layout: FinancingLayout | null,
) {
  if (!layout) return;
  for (let index = 0; index < rounds.length; index += 1) {
    const round = rounds[index];
    if (!round) continue;
    const column = 1 + index;
    const columnLetter = XLSX.utils.encode_col(column);
    const cell = (row: number) => XLSX.utils.encode_cell({ r: row, c: column });
    const excelRow = (row: number) => row + 1;
    sheet[cell(layout.unitPriceRow)] = {
      t: "n",
      f: `IFERROR(${columnLetter}${excelRow(layout.totalConsiderationRow)}/${columnLetter}${excelRow(layout.pricedCapitalRow)},0)`,
      v: round.pricePerRegisteredCapitalYuan,
      z: "0.0000",
    };
    sheet[cell(layout.preMoneyRow)] = {
      t: "n",
      f: `${columnLetter}${excelRow(layout.unitPriceRow)}*${columnLetter}${excelRow(layout.registeredBeforeRow)}`,
      v: round.preMoneyValuationYuan,
      z: "#,##0.00",
    };
    sheet[cell(layout.totalConsiderationRow)] = {
      t: "n",
      f: `SUM(${columnLetter}${excelRow(layout.contributionStartRow)}:${columnLetter}${excelRow(layout.contributionEndRow)})`,
      v: round.totalConsiderationYuan,
      z: "#,##0.00",
    };
    sheet[cell(layout.postMoneyRow)] = round.kind === "primary"
      ? {
          t: "n",
          f: `${columnLetter}${excelRow(layout.unitPriceRow)}*${columnLetter}${excelRow(layout.registeredAfterRow)}`,
          v: round.postMoneyValuationYuan,
          z: "#,##0.00",
        }
      : { t: "s", v: "—" };
    const dateCell = sheet[cell(layout.dateRow)];
    if (dateCell) dateCell.z = "yyyy-mm-dd";
    for (const row of [
      layout.registeredBeforeRow,
      layout.registeredAfterRow,
      layout.pricedCapitalRow,
      ...range(layout.contributionStartRow, layout.contributionEndRow),
    ]) {
      const amountCell = sheet[cell(row)];
      if (amountCell && typeof amountCell.v === "number") amountCell.z = "#,##0.00";
    }
  }
}

function range(start: number, end: number) {
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

function toWorkbookDate(value: string | null) {
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}
