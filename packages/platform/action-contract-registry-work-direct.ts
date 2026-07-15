import { defineActionContractMetadataList, type ActionMutationDomainBindingReference } from "./action-contract";
import { registeredLifecycle, registeredWrite } from "./action-contract-registry-helpers";

const d = (validatorKey: string, commitKey: string): ActionMutationDomainBindingReference => ({ validatorKey, commitKey });

const meeting = (key: string, validator: string, commit: string, target = "Meeting") => registeredWrite({
  key,
  activeEntity: target,
  domain: d(`packages/work/server/domain/meeting-validation.${validator}`, `packages/work/server/meetings.${commit}`),
  shape: "full_record",
  target: key.endsWith(".create") ? "new_record" : "existing_record",
  commitMode: key.endsWith(".create") ? "activate" : "apply_patch",
});

export const WORK_DIRECT_ACTION_CONTRACT_METADATA = defineActionContractMetadataList([
  meeting("work.meetings.meeting.create", "validateMeetingCreate", "createMeeting"),
  meeting("work.meetings.meeting.update", "validateMeetingUpdate", "updateMeeting"),
  registeredLifecycle({ key: "work.meetings.meeting.delete", activeEntity: "Meeting", operation: "delete", domain: d("packages/work/server/domain/meeting-validation.validateMeetingDelete", "packages/work/server/meetings.deleteMeeting"), referencePolicy: "domain" }),
  registeredWrite({ key: "work.meetings.actionCandidate.process", activeEntity: "MeetingActionCandidate", domain: d("packages/work/server/meeting-action-candidate-command.buildMeetingActionCandidateCommand", "packages/work/server/meeting-action-candidate-command.executeMeetingActionCandidateCommand"), shape: "full_record", target: "mixed", commitMode: "native_transition" }),
  meeting("work.meetings.agenda.create", "validateMeetingAgenda", "createMeetingAgendaItem", "MeetingAgendaItem"),
  meeting("work.meetings.decision.create", "validateMeetingDecision", "createMeetingDecision", "MeetingDecision"),
  meeting("work.meetings.minute.create", "validateMeetingMinute", "createMeetingMinuteEntry", "MeetingMinute"),
  meeting("work.meetings.participant.save", "validateMeetingParticipant", "upsertMeetingParticipant", "MeetingParticipant"),
  meeting("work.meetings.proposal.create", "validateMeetingProposal", "createMeetingProposal", "MeetingProposal"),
  registeredLifecycle({ key: "work.meetings.vote.cast", activeEntity: "MeetingVote", operation: "cast", targetIdKey: "proposalId", auditPolicy: "event", domain: d("packages/work/server/domain/meeting-validation.validateMeetingVote", "packages/work/server/meetings.castMeetingVote") }),
  registeredLifecycle({ key: "work.meetings.vote.close", activeEntity: "MeetingProposal", operation: "close", targetIdKey: "proposalId", auditPolicy: "event", domain: d("packages/work/server/domain/meeting-validation.validateMeetingProposalClose", "packages/work/server/meetings.closeMeetingProposal") }),

  registeredWrite({ key: "work.projects.project.create", activeEntity: "Project", domain: d("packages/work/server/domain/project-validation.buildProjectCreateCommand", "packages/work/server/work-task-route-command.executeCreateProjectRouteCommand"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "work.projects.project.update", activeEntity: "Project", domain: d("packages/work/server/work-task-route-command.buildProjectUpdateRouteCommand", "packages/work/server/work-task-route-command.executeUpdateProjectRouteCommand") }),
  registeredLifecycle({ key: "work.projects.project.delete", activeEntity: "Project", operation: "delete", domain: d("packages/work/server/work-task-route-command.buildProjectDeleteRouteCommand", "packages/work/server/work-task-route-command.executeDeleteProjectRouteCommand"), referencePolicy: "domain" }),
  registeredWrite({ key: "work.projects.member.create", activeEntity: "EmployeeProject", domain: d("packages/work/server/domain/project-member-validation.buildProjectMemberCreateCommand", "packages/work/server/project-members.createProjectMemberAction"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "work.projects.member.update", activeEntity: "EmployeeProject", domain: d("packages/work/server/domain/project-member-validation.buildProjectMemberFieldUpdateCommand", "packages/work/server/project-members.updateProjectMemberFieldAction") }),
  registeredLifecycle({ key: "work.projects.member.delete", activeEntity: "EmployeeProject", operation: "delete", domain: d("packages/work/server/domain/project-member-validation.validateProjectMemberDeleteCommand", "packages/work/server/project-members.deleteProjectMemberAction"), referencePolicy: "domain" }),
  registeredWrite({ key: "work.projects.phase.create", activeEntity: "ProjectPlanPhase", domain: d("packages/work/server/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/project-plan.createProjectPlanPhase"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "work.projects.phase.update", activeEntity: "ProjectPlanPhase", domain: d("packages/work/server/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/project-plan.updateProjectPlanPhase") }),
  registeredLifecycle({ key: "work.projects.phase.delete", activeEntity: "ProjectPlanPhase", operation: "delete", domain: d("packages/work/server/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/project-plan.deleteProjectPlanPhase"), referencePolicy: "domain" }),
  registeredWrite({ key: "work.projects.planGantt.save", activeEntity: "ProjectPlan", domain: { bindings: [d("packages/work/server/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/project-plan.saveProjectPlanGantt"), d("packages/work/server/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/project-plan.syncProjectPlanDependencies")] }, shape: "change_set", commitMode: "native_transition" }),
  registeredWrite({ key: "work.projects.baseline.create", activeEntity: "ProjectPlanBaseline", domain: d("packages/work/server/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/project-plan-baselines.createProjectPlanBaseline"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredLifecycle({ key: "work.projects.baseline.activate", activeEntity: "ProjectPlanBaseline", operation: "activate", targetIdKey: "baselineId", domain: d("packages/work/server/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/project-plan-baselines.activateProjectPlanBaseline"), auditPolicy: "event" }),

  registeredWrite({ key: "work.tasks.collaboration.respond", activeEntity: "DepartmentCollaboration", domain: d("packages/work/server/department-collaboration-route-command.buildRespondDepartmentCollaborationCommand", "packages/work/server/department-collaboration-route-command.executeRespondDepartmentCollaborationCommand"), commitMode: "native_transition" }),
  registeredLifecycle({ key: "work.tasks.item.delete", activeEntity: "WorkItem", operation: "delete", domain: d("packages/work/server/work-task-route-command.buildDeleteWorkItemRouteCommand", "packages/work/server/work-task-route-command.executeDeleteWorkItemRouteCommand"), referencePolicy: "domain" }),
  registeredWrite({ key: "work.tasks.okr_control.save", activeEntity: "WorkOkrControlPolicy", domain: d("packages/work/server/domain/work-okr-control-validation.validateWorkOkrControlCommand", "packages/work/server/work-okr-control-admin.updateWorkOkrControlSettings"), shape: "change_set", commitMode: "native_transition" }),
  registeredWrite({ key: "work.tasks.periodSchedule.create", activeEntity: "WorkPeriodScheduleItem", domain: d("packages/work/server/work-task-route-command.buildCreateWorkPeriodScheduleItemRouteCommand", "packages/work/server/work-period-schedule-mutation-executor.executeCreateWorkPeriodScheduleItemRouteCommand"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "work.tasks.plan.create", activeEntity: "WorkPlan", strategy: "draft_table", domain: d("packages/work/server/work-plan-route-command.buildCreateWorkPlanCommand", "packages/work/server/work-plan-route-command.executeCreateWorkPlanCommand"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "work.tasks.plan.save", activeEntity: "WorkPlan", strategy: "draft_table", domain: d("packages/work/server/work-plan-route-command.buildUpdateWorkPlanCommand", "packages/work/server/work-plan-route-command.executeUpdateWorkPlanCommand") }),
  registeredLifecycle({ key: "work.tasks.plan.archive", activeEntity: "WorkPlan", operation: "archive", domain: d("packages/work/server/work-plan-route-command.buildArchiveWorkPlanCommand", "packages/work/server/work-plan-route-command.executeArchiveWorkPlanCommand"), deleteMode: "soft", referencePolicy: "domain" }),
  registeredLifecycle({ key: "work.tasks.plan.delete", activeEntity: "WorkPlan", operation: "delete", domain: d("packages/work/server/work-plan-route-command.buildDeleteWorkPlanCommand", "packages/work/server/work-plan-route-command.executeDeleteWorkPlanCommand"), referencePolicy: "domain" }),
]);
