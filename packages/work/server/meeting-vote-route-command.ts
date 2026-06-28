import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";

import { castMeetingVote, closeMeetingProposal, createMeetingProposal } from "./meetings";

type MeetingVoteRouteAction = "create" | "cast" | "close";

export type MeetingVoteRouteCommand =
  | {
      kind: "create" | "cast";
      userId: number;
      meetingId: number;
      body: Record<string, unknown>;
    }
  | {
      kind: "close";
      userId: number;
      meetingId: number;
      proposalId: number;
    };

export function buildMeetingVoteRouteCommand(input: {
  userId: number;
  meetingId: number;
  body: Record<string, unknown> & {
    action?: MeetingVoteRouteAction;
    title?: string;
    proposalId?: number;
  };
}): DomainValidationResult<MeetingVoteRouteCommand> {
  const action = input.body.action || (input.body.title ? "create" : "cast");
  if (action === "close") {
    if (!input.body.proposalId) return failCommand("表决事项无效", 400, "proposalId");
    return okCommand({
      kind: "close",
      userId: input.userId,
      meetingId: input.meetingId,
      proposalId: input.body.proposalId,
    });
  }
  return okCommand({
    kind: action,
    userId: input.userId,
    meetingId: input.meetingId,
    body: input.body,
  });
}

export function executeMeetingVoteRouteCommand(command: MeetingVoteRouteCommand) {
  if (command.kind === "close") {
    return closeMeetingProposal({
      userId: command.userId,
      meetingId: command.meetingId,
      proposalId: command.proposalId,
    });
  }
  if (command.kind === "create") {
    return createMeetingProposal({
      userId: command.userId,
      meetingId: command.meetingId,
      body: command.body,
    });
  }
  return castMeetingVote({
    userId: command.userId,
    meetingId: command.meetingId,
    body: command.body,
  });
}
