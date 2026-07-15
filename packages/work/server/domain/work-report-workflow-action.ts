export type WorkReportWorkflowActionKind =
  | "objective_submit"
  | "report_submit"
  | "objective_revise"
  | "report_correct";

export function resolveWorkReportWorkflowActionKind(
  reportStage: unknown,
  intent: "submit" | "correct",
): WorkReportWorkflowActionKind {
  const kr = reportStage === "kr";
  if (intent === "correct") return kr ? "objective_revise" : "report_correct";
  return kr ? "objective_submit" : "report_submit";
}
