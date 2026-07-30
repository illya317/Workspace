import { defineActionContractMetadataList, type ActionMutationDomainBindingReference } from "./action-contract";
import { registeredLifecycle, registeredWrite } from "./action-contract-registry-helpers";

const d = (validatorKey: string, commitKey: string): ActionMutationDomainBindingReference => ({ validatorKey, commitKey });

const meeting = (key: string, validator: string, commit: string, target = "Meeting") => registeredWrite({
  key,
  activeEntity: target,
  domain: d(`packages/work/server/meetings/domain/validation.${validator}`, `packages/work/server/meetings/application.${commit}`),
  shape: "full_record",
  target: key.endsWith(".create") ? "new_record" : "existing_record",
  commitMode: key.endsWith(".create") ? "activate" : "apply_patch",
});

const projectNotificationSignalRedrive = registeredLifecycle({
  key: "work.projects.notificationSignal.redrive",
  activeEntity: "ProjectNotificationSignal",
  operation: "custom",
  targetIdKey: "signalId",
  versionKey: "expectedAttemptCount",
  domain: d(
    "packages/work/server/project-notification-route-commands.buildRedriveProjectNotificationSignalCommand",
    "packages/work/server/project-notification-redrive.redriveFailedProjectNotificationSignal",
  ),
  referencePolicy: "domain",
  auditPolicy: "event",
});

export const WORK_DIRECT_ACTION_CONTRACT_METADATA = defineActionContractMetadataList([
  meeting("work.meetings.meeting.create", "validateMeetingCreate", "createMeeting"),
  meeting("work.meetings.meeting.update", "validateMeetingUpdate", "updateMeeting"),
  registeredLifecycle({ key: "work.meetings.meeting.delete", activeEntity: "Meeting", operation: "delete", domain: d("packages/work/server/meetings/domain/validation.validateMeetingDelete", "packages/work/server/meetings/application.deleteMeeting"), referencePolicy: "domain" }),
  registeredWrite({ key: "work.meetings.actionCandidate.process", activeEntity: "MeetingActionCandidate", domain: d("packages/work/server/meetings/action-candidate-command.buildMeetingActionCandidateCommand", "packages/work/server/meetings/action-candidate-command.executeMeetingActionCandidateCommand"), shape: "full_record", target: "mixed", commitMode: "native_transition" }),
  meeting("work.meetings.agenda.create", "validateMeetingAgenda", "createMeetingAgendaItem", "MeetingAgendaItem"),
  meeting("work.meetings.decision.create", "validateMeetingDecision", "createMeetingDecision", "MeetingDecision"),
  meeting("work.meetings.minute.create", "validateMeetingMinute", "createMeetingMinuteEntry", "MeetingMinute"),
  meeting("work.meetings.participant.save", "validateMeetingParticipant", "upsertMeetingParticipant", "MeetingParticipant"),
  meeting("work.meetings.proposal.create", "validateMeetingProposal", "createMeetingProposal", "MeetingProposal"),
  registeredLifecycle({ key: "work.meetings.vote.cast", activeEntity: "MeetingVote", operation: "cast", targetIdKey: "proposalId", auditPolicy: "event", domain: d("packages/work/server/meetings/domain/validation.validateMeetingVote", "packages/work/server/meetings/application.castMeetingVote") }),
  registeredLifecycle({ key: "work.meetings.vote.close", activeEntity: "MeetingProposal", operation: "close", targetIdKey: "proposalId", auditPolicy: "event", domain: d("packages/work/server/meetings/domain/validation.validateMeetingProposalClose", "packages/work/server/meetings/application.closeMeetingProposal") }),

  registeredWrite({ key: "work.projects.project.update", activeEntity: "Project", domain: d("packages/work/server/work-task-route-command.buildProjectUpdateRouteCommand", "packages/work/server/work-task-route-command.executeUpdateProjectRouteCommand") }),
  registeredLifecycle({ key: "work.projects.project.delete", activeEntity: "Project", operation: "delete", versionKey: "expectedVersion", domain: d("packages/work/server/work-task-route-command.buildProjectDeleteRouteCommand", "packages/work/server/work-task-route-command.executeDeleteProjectRouteCommand"), referencePolicy: "domain" }),
  registeredWrite({ key: "work.projects.notificationRule.create", activeEntity: "ProjectNotificationRule", domain: d("packages/work/server/project-notification-route-commands.buildCreateProjectNotificationRuleCommand", "packages/work/server/project-notification-rules.createProjectNotificationRule"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "work.projects.notificationRule.update", activeEntity: "ProjectNotificationRule", domain: d("packages/work/server/project-notification-route-commands.buildUpdateProjectNotificationRuleCommand", "packages/work/server/project-notification-rules.updateProjectNotificationRule"), shape: "full_record", target: "existing_record", commitMode: "apply_patch" }),
  registeredLifecycle({ key: "work.projects.notificationRule.publish", activeEntity: "ProjectNotificationRule", operation: "activate", targetIdKey: "ruleId", versionKey: "version", domain: d("packages/work/server/project-notification-route-commands.buildProjectNotificationRuleTransitionCommand", "packages/work/server/project-notification-rules.publishProjectNotificationRule"), auditPolicy: "history" }),
  registeredLifecycle({ key: "work.projects.notificationRule.archive", activeEntity: "ProjectNotificationRule", operation: "archive", targetIdKey: "ruleId", versionKey: "version", domain: d("packages/work/server/project-notification-route-commands.buildProjectNotificationRuleTransitionCommand", "packages/work/server/project-notification-rules.archiveProjectNotificationRule"), deleteMode: "soft", referencePolicy: "domain", auditPolicy: "history" }),
  {
    ...projectNotificationSignalRedrive,
    payload: {
      ...projectNotificationSignalRedrive.payload,
      changeFields: [{ field: "reason", label: "重试原因", required: true }],
      notes: "The operator reason is trimmed, required, and limited to 500 characters before the redrive transition.",
    },
  },
  registeredWrite({ key: "work.projects.member.create", activeEntity: "EmployeeProject", domain: d("packages/work/server/domain/project-member-validation.buildProjectMemberCreateCommand", "packages/work/server/project-members.createProjectMemberAction"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "work.projects.member.update", activeEntity: "EmployeeProject", domain: d("packages/work/server/domain/project-member-validation.buildProjectMemberFieldUpdateCommand", "packages/work/server/project-members.updateProjectMemberFieldAction") }),
  registeredLifecycle({ key: "work.projects.member.delete", activeEntity: "EmployeeProject", operation: "delete", versionKey: "expectedVersion", domain: d("packages/work/server/domain/project-member-validation.validateProjectMemberDeleteCommand", "packages/work/server/project-members.deleteProjectMemberAction"), referencePolicy: "domain" }),
  registeredWrite({ key: "work.projects.phase.create", activeEntity: "ProjectPlanPhase", domain: d("packages/work/server/projects/plan/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/projects/plan/application.createProjectPlanPhase"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "work.projects.phase.update", activeEntity: "ProjectPlanPhase", domain: d("packages/work/server/projects/plan/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/projects/plan/application.updateProjectPlanPhase") }),
  registeredLifecycle({ key: "work.projects.phase.delete", activeEntity: "ProjectPlanPhase", operation: "delete", versionKey: "expectedVersion", domain: d("packages/work/server/projects/plan/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/projects/plan/application.deleteProjectPlanPhase"), referencePolicy: "domain" }),
  registeredWrite({ key: "work.projects.planGantt.save", activeEntity: "ProjectPlan", domain: { bindings: [d("packages/work/server/projects/plan/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/projects/plan/application.saveProjectPlanGantt"), d("packages/work/server/projects/plan/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/projects/plan/application.syncProjectPlanDependencies")] }, shape: "change_set", commitMode: "native_transition" }),
  registeredWrite({ key: "work.projects.baseline.create", activeEntity: "ProjectPlanBaseline", domain: d("packages/work/server/projects/plan/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/projects/plan/baselines.createProjectPlanBaseline"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredLifecycle({ key: "work.projects.baseline.activate", activeEntity: "ProjectPlanBaseline", operation: "activate", targetIdKey: "baselineId", domain: d("packages/work/server/projects/plan/domain/project-plan-validation.validateProjectPlanCommand", "packages/work/server/projects/plan/baselines.activateProjectPlanBaseline"), auditPolicy: "event" }),

  registeredWrite({ key: "work.tasks.collaboration.respond", activeEntity: "DepartmentCollaboration", domain: d("packages/work/server/department-collaboration-route-command.buildRespondDepartmentCollaborationCommand", "packages/work/server/department-collaboration-route-command.executeRespondDepartmentCollaborationCommand"), commitMode: "native_transition" }),
  registeredLifecycle({ key: "work.tasks.item.delete", activeEntity: "WorkItem", operation: "delete", domain: d("packages/work/server/work-task-route-command.buildDeleteWorkItemRouteCommand", "packages/work/server/work-task-route-command.executeDeleteWorkItemRouteCommand"), referencePolicy: "domain" }),
  registeredWrite({ key: "work.tasks.okr_control.save", activeEntity: "WorkOkrControlPolicy", domain: d("packages/work/server/domain/work-okr-control-validation.validateWorkOkrControlCommand", "packages/work/server/work-okr-control-admin.updateWorkOkrControlSettings"), shape: "change_set", commitMode: "native_transition" }),
  registeredWrite({ key: "work.tasks.kpi_definition.create", activeEntity: "WorkKpiDefinition", domain: d("packages/work/server/domain/work-kpi-definition-validation.validateWorkKpiDefinitionCommand", "packages/work/server/work-kpi-definitions.saveKpiDefinitionRevision"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "work.tasks.kpi_definition.revise", activeEntity: "WorkKpiDefinition", domain: d("packages/work/server/domain/work-kpi-definition-validation.validateWorkKpiDefinitionCommand", "packages/work/server/work-kpi-definitions.saveKpiDefinitionRevision"), shape: "full_record", target: "existing_record", commitMode: "apply_patch" }),
  registeredLifecycle({ key: "work.tasks.kpi_definition.delete", activeEntity: "WorkKpiDefinition", operation: "delete", versionKey: "expectedVersion", deleteMode: "hard", domain: d("packages/work/server/domain/work-kpi-definition-validation.validateWorkKpiDefinitionDeleteCommand", "packages/work/server/work-kpi-definitions.deleteKpiDefinition"), referencePolicy: "domain" }),
  registeredWrite({ key: "work.tasks.kpi_measurement.update", activeEntity: "WorkKpiAssignment", domain: d("packages/work/server/domain/work-kpi-result-validation.validateWorkKpiMeasurementsCommand", "packages/work/server/work-kpi-scorecard.updateKpiMeasurements"), shape: "change_set", target: "existing_record", commitMode: "apply_patch" }),
  registeredWrite({ key: "work.tasks.periodSchedule.create", activeEntity: "WorkPeriodScheduleItem", domain: d("packages/work/server/work-task-route-command.buildCreateWorkPeriodScheduleItemRouteCommand", "packages/work/server/work-period-schedule-mutation-executor.executeCreateWorkPeriodScheduleItemRouteCommand"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "work.tasks.plan.create", activeEntity: "WorkPlan", strategy: "draft_table", domain: d("packages/work/server/work-plan-route-command.buildCreateWorkPlanCommand", "packages/work/server/work-plan-route-command.executeCreateWorkPlanCommand"), shape: "full_record", target: "new_record", commitMode: "activate" }),
  registeredWrite({ key: "work.tasks.plan.save", activeEntity: "WorkPlan", strategy: "draft_table", domain: d("packages/work/server/work-plan-route-command.buildUpdateWorkPlanCommand", "packages/work/server/work-plan-route-command.executeUpdateWorkPlanCommand") }),
  registeredLifecycle({ key: "work.tasks.plan.archive", activeEntity: "WorkPlan", operation: "archive", domain: d("packages/work/server/work-plan-route-command.buildArchiveWorkPlanCommand", "packages/work/server/work-plan-route-command.executeArchiveWorkPlanCommand"), deleteMode: "soft", referencePolicy: "domain" }),
  registeredLifecycle({ key: "work.tasks.plan.delete", activeEntity: "WorkPlan", operation: "delete", domain: d("packages/work/server/work-plan-route-command.buildDeleteWorkPlanCommand", "packages/work/server/work-plan-route-command.executeDeleteWorkPlanCommand"), referencePolicy: "domain" }),
]);
