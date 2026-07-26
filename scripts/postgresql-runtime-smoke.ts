import "dotenv/config";
import { rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { listReclassResults } from "@workspace/finance/server/ledger/reclass-results/list";
import { searchHrAutocomplete } from "@workspace/hr/server/autocomplete";
import { getLibraryDocumentAccessPolicy } from "@workspace/library/server/permissions";
import { queryLibraryDocumentSet } from "@workspace/library/server/search-query";
import {
  appendAgentSessionMessage,
  prepareAgentSession,
  readAgentSessionMessages,
} from "@workspace/platform/server/agent/sessions";
import { createNotification, listUserNotifications } from "@workspace/platform/server/notifications";
import { prisma } from "@workspace/platform/server/prisma";
import type { SessionUser } from "@workspace/platform/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

async function main() {
  const smokeAgentRoot = path.join(os.tmpdir(), `workspace-postgresql-smoke-${process.pid}`);
  process.env.AGENT_DATA_DIR = smokeAgentRoot;
  let notificationId: number | null = null;
  let sessionId: string | null = null;

  try {
    const database = await prisma.$queryRaw<Array<{ version: string; unvalidated: number }>>`
      SELECT version() AS version,
             (SELECT count(*)::int FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND NOT convalidated) AS unvalidated
    `;
    assert(database[0]?.version.includes("PostgreSQL"), "runtime is connected to PostgreSQL");
    assert(Number(database[0]?.unvalidated) === 0, "all PostgreSQL constraints are validated");

    const admin = await prisma.user.findFirst({
      where: { username: "admin", canLogin: true },
      select: { id: true, username: true, wxUserId: true, avatar: true },
    });
    assert(admin, "admin login identity is present");
    const sessionUser: SessionUser = { ...admin, isSuperAdmin: true };
    const caseInsensitiveUserSearch = await searchHrAutocomplete("user", admin.username.toUpperCase(), false);
    assert(
      caseInsensitiveUserSearch.status === "ok" && caseInsensitiveUserSearch.items.some((item) => item.id === admin.id),
      "PostgreSQL user search remains case-insensitive",
    );

    const plans = await prisma.workPlan.findMany({
      where: { targetType: "personal", targetId: admin.id },
      take: 5,
      orderBy: { id: "asc" },
    });
    assert(Array.isArray(plans), "Work plan model loads from PostgreSQL");

    const sourceDocument = await prisma.libraryDocument.findFirst({
      where: { status: "active", currentVersionId: { not: null } },
      orderBy: { id: "asc" },
      select: { docId: true },
    });
    assert(sourceDocument, "Library has an active searchable document");
    const libraryAccessPolicy = await getLibraryDocumentAccessPolicy(admin.id);
    const library = await queryLibraryDocumentSet({
      query: sourceDocument.docId,
      limit: 3,
      accessPolicy: libraryAccessPolicy,
    });
    assert(library.documents.some((document) => document.docId === sourceDocument.docId), "Library PostgreSQL search returns the exact document id");

    const reclass = await prisma.reclassResult.findFirst({ orderBy: { id: "asc" }, select: { periodId: true } });
    assert(reclass, "Finance has reclassification results");
    const reclassPage = await listReclassResults({ periodId: reclass.periodId, status: "all", pageSize: 5 });
    assert(reclassPage.total > 0, "Finance reclassification list loads historical rows");

    const notification = await createNotification({
      recipientUserId: admin.id,
      type: "postgresql.runtime.smoke",
      title: "PostgreSQL runtime smoke",
      body: "temporary local validation row",
    });
    assert(notification, "notification write succeeds");
    notificationId = notification.id;
    const notifications = await listUserNotifications(admin.id, { limit: 50, category: "ordinary", filter: "all" });
    assert(notifications.items.some((item) => item.id === notification.id), "notification read sees the temporary row");

    const prepared = await prepareAgentSession(sessionUser, {
      path: "/work",
      title: "PostgreSQL runtime smoke",
      contextLabel: "temporary local validation",
    });
    sessionId = prepared.session.id;
    await appendAgentSessionMessage(prepared.session, { role: "user", content: "temporary local validation" }, sessionUser);
    const messages = await readAgentSessionMessages(prepared.session);
    assert(messages.length === 1 && messages[0].content === "temporary local validation", "Agent session database counters and file storage both work");
  } finally {
    if (notificationId !== null) await prisma.notification.deleteMany({ where: { id: notificationId } });
    if (sessionId !== null) await prisma.agentSession.deleteMany({ where: { id: sessionId } });
    if (process.env.AGENT_DATA_DIR) await rm(process.env.AGENT_DATA_DIR, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
