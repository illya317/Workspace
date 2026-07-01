import { authorize, evaluatePermissionAction, isSuperAdmin } from "@workspace/platform/server/auth";
import { prisma } from "@workspace/platform/server/prisma";

export type MeetingAccessRole = "access" | "write" | "delete" | "admin";

const MEETING_VIEW_ALL_RESOURCE = "work.meetings.viewAll";
const EDITOR_ROLES = new Set(["owner", "secretary"]);
const MANAGER_ROLES = new Set(["owner"]);
const VOTER_ROLES = new Set(["owner", "voter"]);

export interface MeetingPermissionResult {
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
  canDelete: boolean;
  canVote: boolean;
  canViewAll: boolean;
  participantRole: string | null;
}

type MeetingPermissionMeeting = {
  id: number;
  visibility: string;
  ownerUserId: number | null;
  secretaryUserId: number | null;
  createdBy: number | null;
  participants?: Array<{ userId: number; role: string; canVote: boolean }>;
};

export async function canUseMeetings(userId: number, role: MeetingAccessRole = "access") {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: "work.meetings", action: role });
}

export async function hasMeetingViewAll(userId: number) {
  if (await isSuperAdmin(userId)) return true;
  return authorize({ user: userId, resourceKey: MEETING_VIEW_ALL_RESOURCE, action: "access" });
}

export async function buildVisibleMeetingWhere(userId: number) {
  if (!(await canUseMeetings(userId, "access"))) return { id: -1 };
  if (await hasMeetingViewAll(userId)) return {};
  return {
    OR: [
      { visibility: "public" },
      { createdBy: userId },
      { ownerUserId: userId },
      { secretaryUserId: userId },
      { participants: { some: { userId } } },
    ],
  };
}

export async function getMeetingPermissions(
  userId: number,
  meeting: MeetingPermissionMeeting,
): Promise<MeetingPermissionResult> {
  if (await isSuperAdmin(userId)) {
    const participant = meeting.participants?.find((item) => item.userId === userId) ?? null;
    return {
      canView: true,
      canEdit: true,
      canManage: true,
      canDelete: true,
      canVote: true,
      canViewAll: true,
      participantRole: participant?.role ?? null,
    };
  }

  const [hasAccess, hasWrite, hasDelete, canViewAll] = await Promise.all([
    canUseMeetings(userId, "access"),
    canUseMeetings(userId, "write"),
    canUseMeetings(userId, "delete"),
    hasMeetingViewAll(userId),
  ]);
  if (!hasAccess) return emptyPermissions(false);

  const participant = meeting.participants?.find((item) => item.userId === userId) ?? null;
  const role = participant?.role ?? null;
  const ownsMeeting = meeting.ownerUserId === userId || meeting.createdBy === userId;
  const recordsMeeting = meeting.secretaryUserId === userId;
  const participantCanEdit = Boolean(role && EDITOR_ROLES.has(role));
  const participantCanManage = Boolean(role && MANAGER_ROLES.has(role));
  const participantCanVote = Boolean(participant?.canVote || (role && VOTER_ROLES.has(role)));
  const canView = canViewAll || meeting.visibility === "public" || ownsMeeting || recordsMeeting || Boolean(participant);
  const canManage = hasWrite && (ownsMeeting || participantCanManage);
  const canEdit = hasWrite && (ownsMeeting || recordsMeeting || participantCanEdit);

  return {
    canView,
    canEdit,
    canManage,
    canDelete: hasDelete && (ownsMeeting || participantCanManage),
    canVote: participantCanVote,
    canViewAll,
    participantRole: role,
  };
}

export async function getMeetingPermissionsById(userId: number, meetingId: number) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      visibility: true,
      ownerUserId: true,
      secretaryUserId: true,
      createdBy: true,
      participants: { select: { userId: true, role: true, canVote: true } },
    },
  });
  if (!meeting) return null;
  return getMeetingPermissions(userId, meeting);
}

export async function canViewMeeting(userId: number, meetingId: number) {
  const permissions = await getMeetingPermissionsById(userId, meetingId);
  return Boolean(permissions?.canView);
}

export async function canEditMeeting(userId: number, meetingId: number) {
  const permissions = await getMeetingPermissionsById(userId, meetingId);
  return Boolean(permissions?.canEdit);
}

export async function canApproveMeeting(userId: number, meetingId: number) {
  if (await isSuperAdmin(userId)) return true;
  if (!(await evaluatePermissionAction(userId, "work.meetings", "approve"))) return false;
  const permissions = await getMeetingPermissionsById(userId, meetingId);
  return Boolean(permissions?.canManage || permissions?.participantRole === "secretary");
}

export async function canDeleteMeeting(userId: number, meetingId: number) {
  const permissions = await getMeetingPermissionsById(userId, meetingId);
  return Boolean(permissions?.canDelete);
}

function emptyPermissions(canViewAll: boolean): MeetingPermissionResult {
  return {
    canView: false,
    canEdit: false,
    canManage: false,
    canDelete: false,
    canVote: false,
    canViewAll,
    participantRole: null,
  };
}
