export type PeriodDossierTask = {
  id: string;
  title: string;
  plannedEndDate: string | null;
  actualEndDate: string | null;
};

export type PeriodDossierReportRow = {
  id: string;
  objective: string;
  current: PeriodDossierTask[];
  next: PeriodDossierTask[];
  keyResults: string[];
};

export type PeriodDossierInitialGoal = {
  routine: Array<{ id: string; title: string; responsibility: string }>;
  columns: Array<{ key: string; label: string; startDate: string; endDate: string }>;
  objectives: Array<{
    id: string;
    title: string;
    kindLabel: string;
    cells: Record<string, string[]>;
  }>;
  alignments: Array<{
    id: string;
    group: string;
    title: string;
    source: string;
    dateRange: string;
  }>;
};

export type PeriodDossierModel = {
  subject: {
    kind: "personal" | "department" | "project";
    id: number;
    code: string;
    name: string;
    meta: Array<{ label: string; value: string }>;
  };
  period: {
    id: number;
    type: "weekly" | "monthly" | "quarterly" | "half_year" | "yearly";
    label: string;
    startDate: string;
    endDate: string;
  };
  content:
    | { kind: "report"; saved: boolean; rows: PeriodDossierReportRow[] }
    | { kind: "initial-goal"; data: PeriodDossierInitialGoal };
};
