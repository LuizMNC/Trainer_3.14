import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_COOKIE_NAME,
  getAuthConfigState,
  sanitizeNextPath,
  verifyAccessToken,
} from "./lib/server/accessAuth.ts";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

function isProtectedStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/replays/") ||
    /\.(?:json|txt|csv|phh|sqlite3?)$/i.test(pathname)
  );
}

export async function middleware(request: NextRequest) {
  const state = getAuthConfigState();
  if (state === "disabled") {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  if (pathname === "/api/auth/login" || pathname === "/api/auth/logout") {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  const token = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
  const authenticated =
    state === "enforced" &&
    (await verifyAccessToken(token, process.env.TREINERLM_ACCESS_PASSWORD ?? "", {
      secret: process.env.TREINERLM_AUTH_SECRET,
    }));

  if (pathname === "/login") {
    if (authenticated) {
      const nextTarget = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
      const parsedNext = new URL(nextTarget, "http://localhost");
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = parsedNext.pathname;
      redirectUrl.search = parsedNext.search;
      redirectUrl.hash = parsedNext.hash;
      const redirectResponse = NextResponse.redirect(redirectUrl);
      redirectResponse.headers.set("Cache-Control", "no-store");
      redirectResponse.headers.set("X-Robots-Tag", "noindex, nofollow");
      return redirectResponse;
    }
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  if (authenticated) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  if (pathname.startsWith("/api/")) {
    if (state === "misconfigured") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Acesso bloqueado: configure TREINERLM_ACCESS_PASSWORD nas variáveis de ambiente da Vercel.",
        },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Autenticação necessária." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  if (isProtectedStaticAsset(pathname)) {
    return NextResponse.json(
      { ok: false, error: "Autenticação necessária." },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.hash = "";
  const requestedPath = `${pathname}${search}`;
  const safeNext = sanitizeNextPath(requestedPath);
  if (safeNext !== "/") {
    loginUrl.searchParams.set("next", safeNext);
  }
  const redirectResponse = NextResponse.redirect(loginUrl);
  redirectResponse.headers.set("Cache-Control", "no-store");
  redirectResponse.headers.set("X-Robots-Tag", "noindex, nofollow");
  return redirectResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
