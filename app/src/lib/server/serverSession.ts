import { cookies } from "next/headers";
import {
  ACCESS_COOKIE_NAME,
  getAuthConfigState,
  verifyAccessToken,
  type AuthConfigState,
} from "./accessAuth.ts";

export interface ServerSessionStatus {
  state: AuthConfigState;
  authenticated: boolean;
}

export async function getServerSessionStatus(): Promise<ServerSessionStatus> {
  const state = getAuthConfigState();
  if (state === "disabled") {
    return { state, authenticated: true };
  }
  if (state === "misconfigured") {
    return { state, authenticated: false };
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_COOKIE_NAME)?.value;
  const authenticated = await verifyAccessToken(
    token,
    process.env.TREINERLM_ACCESS_PASSWORD ?? "",
    { secret: process.env.TREINERLM_AUTH_SECRET },
  );
  return { state, authenticated };
}
