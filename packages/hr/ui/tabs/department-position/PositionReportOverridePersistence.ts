export type PlacementRow = {
  clientKey: string;
  id: number | null;
  version: number | null;
  companyId: number | null;
  companyName: string;
  departmentId: number | null;
  departmentPath: string;
  reportToPositionId: number | null;
  reportToPositionName: string;
  headcount: string;
  isActive: boolean;
  edpCount: number;
};

export function normalizePositionReportOverrideRows(rows: PlacementRow[]) {
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    companyId: row.companyId,
    departmentId: row.departmentId,
    reportToPositionId: row.reportToPositionId,
    headcount: row.headcount === "" ? null : Number(row.headcount),
    isActive: row.isActive,
  }));
}
