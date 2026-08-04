import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUTH_COOKIE_CONTRACT,
  LEGACY_SESSION_COOKIE_NAME,
  verifyToken,
} from "@workspace/platform/server/auth";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_CONTRACT.sessionName)?.value
    ?? cookieStore.get(LEGACY_SESSION_COOKIE_NAME)?.value;

  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      redirect("/work");
    }
  }

  redirect("/login");
}
