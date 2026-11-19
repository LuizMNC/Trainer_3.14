import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE_NAME,
  isSecureRequest,
} from "../../../../lib/server/accessAuth.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json(
      { ok: false, error: "Origem recusada." },
      { status: 403, headers: SECURITY_HEADERS },
    );
  }

  const response = NextResponse.json({ ok: true }, { headers: SECURITY_HEADERS });
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isSecureRequest(request),
    maxAge: 0,
  });
  return response;
}
