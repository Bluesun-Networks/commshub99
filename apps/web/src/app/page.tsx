// SPDX-License-Identifier: AGPL-3.0-or-later
import { getAuthBootstrapState, getSessionByToken, SESSION_COOKIE_NAME } from "@commshub99/auth";
import { cookies } from "next/headers";
import { AppShell } from "../components/AppShell";
import { AuthScreen } from "../components/AuthScreen";

export default async function Home() {
  const cookieStore = await cookies();
  const session = getSessionByToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  if (!session) {
    const bootstrap = getAuthBootstrapState();

    return <AuthScreen mode={bootstrap.needsBootstrap ? "bootstrap" : "login"} />;
  }

  return <AppShell currentUser={session.user} />;
}
