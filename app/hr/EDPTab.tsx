"use client";

import GenericTableTab from "./GenericTableTab";
import { edpConfig } from "./tabConfigs";
import type { HRUser } from "./types";

export default function EDPTab({ user }: { user: HRUser }) {
  return <GenericTableTab config={edpConfig} user={user} />;
}
