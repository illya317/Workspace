export type Department = {
  id: number;
  code: string;
  name: string;
  alias: string | null;
  hierarchyKind: "G" | "M";
  level: number;
  levelCode: string;
  levelLabel: string;
  parentId: number | null;
  parentName: string | null;
  managerPositionId: number | null;
  managerPositionName: string | null;
  managerEmployeeIds: number[];
  managerEmployeeNames: string[];
  managerNames: string[];
  managerName: string | null;
  headcount: number;
  isArchived: boolean;
  archivedAt: string | null;
  version: number;
  asOfDate: string;
  temporal: OrganizationTemporal<{
    code: string;
    name: string;
    alias: string | null;
    hierarchyKind: string;
    level: number;
    parentId: number | null;
    managerPositionId: number | null;
  }>;
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
  departmentCode: string | null;
  departmentName: string | null;
  positionDescriptionId: number | null;
  positionDescriptionName: string | null;
  positionDescriptionCode: string | null;
  positionDescriptionDepartmentName: string | null;
  positionDescriptionDetails: PositionDetails | null;
  reportTo: string | null;
  reportToPositionId: number | null;
  summary: string | null;
  positionPurpose: string | null;
  headcountPlan: number | null;
  version: number;
  asOfDate: string;
  temporal: OrganizationTemporal<{
    code: string;
    name: string;
    alias: string | null;
    departmentId: number | null;
    reportToPositionId: number | null;
  }>;
  positionDescriptionVersion: string | null;
  positionDescriptionSequence: number | null;
  effectiveDate: string | null;
  sourceFile: string | null;
  headcount: number;
  positionReportOverrideCount?: number;
  functionalPlacementCount: number;
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
  "id" | "code" | "name" | "alias" | "departmentId" | "reportTo" | "reportToPositionId"
> & OrganizationChangeDraft;

export type OrganizationTemporalItem<TPayload> = {
  id: number;
  sequence: number;
  validFrom: string | null;
  validToExclusive: string | null;
  recordState: string;
  temporalState: "past" | "current" | "upcoming" | "invalid";
  isLive: boolean;
  changeKind: string;
  reason: string | null;
  recordedAt: string | null;
  recordedBy: number | null;
  payload: TPayload;
};

export type OrganizationTemporal<TPayload> = {
  current: OrganizationTemporalItem<TPayload> | null;
  upcoming: OrganizationTemporalItem<TPayload>[];
  history: OrganizationTemporalItem<TPayload>[];
};

export type OrganizationChangeDraft = {
  effectiveOn: string;
  changeKind: "schedule" | "correct";
  changeReason: string;
};

export type DescriptionDraft = {
  id: number;
  sequence: number;
  code: string;
  name: string;
  departmentName: string;
  positionPurpose: string;
  summary: string;
  headcount: string;
  version: string;
  effectiveDate: string;
  sourceFile: string;
  details: string;
  changeKind: "change" | "correction";
  changeReason: string;
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
  hierarchyKind: "G" | "M";
  level: 1 | 2 | 3;
  parentId: number | null;
  managerPositionId: number | null;
  managerPositionName: string;
  managerEmployeeIds: number[];
  managerEmployeeNames: string[];
  managerName: string;
} & OrganizationChangeDraft;

export type CreateDepartmentDraft = {
  hierarchyKind: "G" | "M";
  level: 1 | 2 | 3;
  parentId: number | null;
  code: string;
  name: string;
};

export type CreatePositionDraft = {
  departmentId: number | null;
  name: string;
  reportTo: string;
  reportToPositionId: number | null;
};

export type DepartmentPositionMode = "organization" | "position";

export type ArchivedEntityTab = "departments" | "positions";
