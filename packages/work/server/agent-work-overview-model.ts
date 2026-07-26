type WorkAgentActionPermissions = {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canArchive: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canManagePermissions: boolean;
};

type WorkAgentSpaceShape = {
  targetType: string;
  targetId: number;
  actionPermissions: WorkAgentActionPermissions;
};

export function intersectWorkSpaces<TSpace extends WorkAgentSpaceShape>(
  actorSpaces: TSpace[],
  requesterSpaces: TSpace[],
): TSpace[] {
  const requesterByKey = new Map(requesterSpaces.map((space) => [spaceKey(space), space]));
  return actorSpaces.flatMap((space) => {
    const requesterSpace = requesterByKey.get(spaceKey(space));
    if (!requesterSpace) return [];
    return [{
      ...space,
      actionPermissions: intersectActionPermissions(space.actionPermissions, requesterSpace.actionPermissions),
    }];
  });
}

function intersectActionPermissions(actor: WorkAgentActionPermissions, requester: WorkAgentActionPermissions) {
  return {
    canRead: actor.canRead && requester.canRead,
    canCreate: actor.canCreate && requester.canCreate,
    canUpdate: actor.canUpdate && requester.canUpdate,
    canDelete: actor.canDelete && requester.canDelete,
    canArchive: actor.canArchive && requester.canArchive,
    canSubmit: actor.canSubmit && requester.canSubmit,
    canApprove: actor.canApprove && requester.canApprove,
    canManagePermissions: actor.canManagePermissions && requester.canManagePermissions,
  };
}

function spaceKey(space: { targetType: string; targetId: number }) {
  return `${space.targetType}:${space.targetId}`;
}
