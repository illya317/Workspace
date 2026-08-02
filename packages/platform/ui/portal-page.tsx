import type { PortalSlot } from "../portal-preferences";
import type { SessionUser } from "../types";
import PortalClient from "./PortalClient";

export function renderPortalPage({ user, initialSlots }: { user: SessionUser; initialSlots: PortalSlot[] }) {
  return <PortalClient user={user} initialSlots={initialSlots} />;
}
