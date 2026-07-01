export type Department = {
  id: number;
  code: string;
  name: string;
  alias: string | null;
  level: number;
  parentId: number | null;
  parentName: string | null;
  managerUserId: number | null;
  managerUserIds: number[];
  managerPositionId: number | null;
  managerPositionName: string | null;
  managerNames: string[];
  managerName: string | null;
  headcount: number;
  isArchived: boolean;
  archivedAt: string | null;
  version: number;
  children: { id: number; name: string }[];
  descriptions: DepartmentDescription[];
};

export type PositionDetails = Record<string, unknown>;

export type DepartmentDescription = {
  id: number;
  code: string;
  name: string;
  sourceFile: string;
  codeRaw: string | null;
  details: Record<string, unknown> | null;
};

export type Position = {
  id: number;
  code: string;
  codeRaw: string | null;
  name: string;
  alias: string | null;
  departmentId: number | null;
  departmentName: string | null;
  positionDescriptionId: number | null;
  positionDescriptionName: string | null;
  positionDescriptionCode: string | null;
  positionDescriptionDepartmentName: string | null;
  positionDescriptionDetails: PositionDetails | null;
  reportTo: string | null;
  summary: string | null;
  positionPurpose: string | null;
  headcountPlan: number | null;
  version: number;
  positionDescriptionVersion: string | null;
  effectiveDate: string | null;
  sourceFile: string | null;
  headcount: number;
  isArchived: boolean;
  archivedAt: string | null;
};

export type DepartmentPositionStats = {
  directPositions: number;
  totalPositions: number;
  directHeadcount: number;
  totalHeadcount: number;
};

export type Selection =
  | { type: "department"; id: number }
  | { type: "position"; id: number }
  | null;

export type PositionDraft = Pick<
  Position,
  "id" | "code" | "name" | "alias" | "departmentId" | "positionDescriptionId"
>;

export type DescriptionDraft = {
  id: number;
  code: string;
  name: string;
  departmentName: string;
  reportTo: string;
  positionPurpose: string;
  summary: string;
  headcount: string;
  version: string;
  effectiveDate: string;
  sourceFile: string;
  details: string;
};

export type DepartmentDescriptionDraft = {
  id: number | null;
  code: string;
  name: string;
  sourceFile: string;
  codeRaw: string;
  details: string;
};

export type DepartmentDraft = {
  id: number;
  code: string;
  name: string;
  alias: string;
  level: 1 | 2 | 3;
  parentId: number | null;
  managerPositionId: number | null;
  managerPositionName: string;
  managerName: string;
};

export type CreateDepartmentDraft = {
  level: 1 | 2 | 3;
  parentId: number | null;
  code: string;
  name: string;
};

export type CreatePositionDraft = {
  departmentId: number | null;
  name: string;
};

export type DepartmentPositionMode = "organization" | "position";

export type ArchivedEntityTab = "departments" | "positions";
