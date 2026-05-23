"use client";

import GenericTableTab from "./GenericTableTab";
import { projectConfig } from "./tabConfigs";
import type { HRUser } from "./types";

export default function ProjectTab({ user }: { user: HRUser }) {
  return <GenericTableTab config={projectConfig} user={user} />;
}
