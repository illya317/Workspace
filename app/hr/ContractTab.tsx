"use client";

import GenericTableTab from "./GenericTableTab";
import { contractConfig } from "./tabConfigs";
import type { HRUser } from "./types";

export default function ContractTab({ user }: { user: HRUser }) {
  return <GenericTableTab config={contractConfig} user={user} />;
}
