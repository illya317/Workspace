import type { SessionUser } from "../types";
import PortalClient from "./PortalClient";

export function renderPortalPage({ user }: { user: SessionUser }) {
  return <PortalClient user={user} />;
}
