import {
  failCommand,
  okCommand,
  type DomainServiceResult,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import {
  createMeetingActionCandidate,
  linkMeetingActionCandidate,
} from "./meetings";

type MeetingActionCandidateAction =
  | "ignore"
  | "linkWorkPlan"
  | "createWorkPlan"
  | "linkWorkItem"
  | "createWorkItem"
  | "linkProjectTask"
  | "createProjectTask";

export type MeetingActionCandidateRouteCommand =
  | {
      kind: "create";
      userId: number;
      meetingId: number;
      body: Record<string, unknown>;
    }
  | {
      kind: "link";
      userId: number;
      meetingId: number;
      candidateId: number;
      body: Record<string, unknown>;
    };

export function buildMeetingActionCandidateCommand(input: {
  userId: number;
  meetingId: number;
  body: Record<string, unknown> & {
    action?: MeetingActionCandidateAction;
    candidateId?: number;
  };
}): DomainValidationResult<MeetingActionCandidateRouteCommand> {
  if (!input.body.action) {
    return okCommand({
      kind: "create",
      userId: input.userId,
      meetingId: input.meetingId,
      body: input.body,
    });
  }

  if (!input.body.candidateId) return failCommand("行动候选 ID 无效");
  return okCommand({
    kind: "link",
    userId: input.userId,
    meetingId: input.meetingId,
    candidateId: input.body.candidateId,
    body: input.body,
  });
}

export function executeMeetingActionCandidateCommand(
  command: MeetingActionCandidateRouteCommand,
): Promise<DomainServiceResult<unknown>> {
  if (command.kind === "create") {
    return createMeetingActionCandidate({
      userId: command.userId,
      meetingId: command.meetingId,
      body: command.body,
    });
  }

  return linkMeetingActionCandidate({
    userId: command.userId,
    meetingId: command.meetingId,
    candidateId: command.candidateId,
    body: command.body,
  });
}
