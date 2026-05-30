import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import AppShell from "@/app/components/AppShell";
import { buildTree, getDefaultRoot } from "@/server/services/library/config";
import LibraryClient from "./LibraryClient";

const ROOT = getDefaultRoot();
const ROOT_LABEL = process.env.LIBRARY_LABEL || "资料库";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const tree = ROOT ? await buildTree(ROOT, "/library") : [];

  return (
    <AppShell title={ROOT_LABEL} backHref="/portal" user={user}>
      <LibraryClient tree={tree} rootLabel={ROOT_LABEL} />
    </AppShell>
  );
}
