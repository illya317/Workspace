"use client";

import GenericTableTab from "./GenericTableTab";
import { positionConfig } from "./tabConfigs";
import type { HRUser } from "./types";

export default function PositionTab({ user }: { user: HRUser }) {
  return <GenericTableTab config={positionConfig} user={user} />;
}
