export type ProjectMemberNotificationPayload = {
  projectId: number;
  employeeId: number;
  projectName: string;
  role: string;
  inviterName: string;
  changedFromRole?: string | null;
  recordId: number;
  changeUid: string;
};
