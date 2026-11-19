import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE_NAME,
  createAccessToken,
  createLoginRateLimiter,
  DEFAULT_SESSION_TTL_SECONDS,
  extractClientIp,
  getAuthConfigState,
  isSecureRequest,
  sanitizeNextPath,
  SHORT_SESSION_TTL_SECONDS,
  verifyAccessPassword,
} from "../../../../lib/server/accessAuth.ts";
import { limitedBody, PayloadTooLargeError } from "../../../../lib/server/libraryAccess.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const MAX_LOGIN_BODY_BYTES = 8 * 1024;
const rateLimiter = createLoginRateLimiter();

interface LoginPayload {
  password?: unknown;
  remember?: unknown;
  next?: unknown;
}

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json(
      { ok: false, error: "Origem recusada." },
      { status: 403, headers: SECURITY_HEADERS },
    );
  }

  const state = getAuthConfigState();
  if (state === "misconfigured") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Senha de acesso não configurada no servidor. Defina TREINERLM_ACCESS_PASSWORD na Vercel e publique novamente.",
      },
      { status: 503, headers: SECURITY_HEADERS },
    );
  }

  if (state === "disabled") {
    return NextResponse.json(
      { ok: true, authEnabled: false, next: "/" },
      { headers: SECURITY_HEADERS },
    );
  }

  const clientIp = extractClientIp(request.headers);
  const gate = rateLimiter.check(clientIp);
  if (!gate.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `Muitas tentativas incorretas. Aguarde ${gate.retryAfterSeconds}s e tente novamente.`,
      },
      {
        status: 429,
        headers: {
          ...SECURITY_HEADERS,
          "Retry-After": String(gate.retryAfterSeconds),
        },
      },
    );
  }

  try {
    const rawBytes = await limitedBody(request, MAX_LOGIN_BODY_BYTES);
    let parsed: unknown;
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
      parsed = JSON.parse(decoded);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Requisição inválida." },
        { status: 400, headers: SECURITY_HEADERS },
      );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        { ok: false, error: "Formato inválido." },
        { status: 400, headers: SECURITY_HEADERS },
      );
    }

    const body = parsed as LoginPayload;
    const candidate = typeof body.password === "string" ? body.password : "";
    if (!candidate || candidate.length > 512) {
      return NextResponse.json(
        { ok: false, error: "Informe a senha de acesso." },
        { status: 400, headers: SECURITY_HEADERS },
      );
    }

    const expectedPassword = process.env.TREINERLM_ACCESS_PASSWORD ?? "";
    const valid = await verifyAccessPassword(candidate, expectedPassword);
    if (!valid) {
      const status = rateLimiter.recordFailure(clientIp);
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (status.locked) {
        return NextResponse.json(
          {
            ok: false,
            error: `Muitas tentativas incorretas. Aguarde ${status.retryAfterSeconds}s e tente novamente.`,
          },
          {
            status: 429,
            headers: {
              ...SECURITY_HEADERS,
              "Retry-After": String(status.retryAfterSeconds),
            },
          },
        );
      }
      return NextResponse.json(
        { ok: false, error: "Senha incorreta. Confira e tente novamente." },
        { status: 401, headers: SECURITY_HEADERS },
      );
    }

    rateLimiter.clear(clientIp);
    const remember = body.remember !== false;
    const ttlSeconds = remember ? DEFAULT_SESSION_TTL_SECONDS : SHORT_SESSION_TTL_SECONDS;
    const token = await createAccessToken(expectedPassword, {
      secret: process.env.TREINERLM_AUTH_SECRET,
      ttlSeconds,
    });

    const nextTarget = sanitizeNextPath(
      typeof body.next === "string" ? body.next : undefined,
    );
    const response = NextResponse.json(
      { ok: true, next: nextTarget },
      { headers: SECURITY_HEADERS },
    );

    response.cookies.set({
      name: ACCESS_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: isSecureRequest(request),
      ...(remember ? { maxAge: ttlSeconds } : {}),
    });

    return response;
  } catch (err: unknown) {
    if (err instanceof PayloadTooLargeError) {
      return NextResponse.json(
        { ok: false, error: "Requisição excede o tamanho permitido." },
        { status: 413, headers: SECURITY_HEADERS },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Não foi possível validar o acesso." },
      { status: 500, headers: SECURITY_HEADERS },
    );
  }
}
