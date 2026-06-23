import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "@workspace/platform/server/auth";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      redirect("/work/tasks");
    }
  }

  redirect("/login");
}
