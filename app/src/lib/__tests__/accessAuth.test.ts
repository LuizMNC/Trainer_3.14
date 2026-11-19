import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import rangesData from "../../data/ranges_gto.json" with { type: "json" };
import {
  ACCESS_COOKIE_NAME,
  createAccessToken,
  createLoginRateLimiter,
  getAuthConfigState,
  LOGIN_MAX_FAILURES,
  sanitizeNextPath,
  verifyAccessPassword,
  verifyAccessToken,
} from "../server/accessAuth.ts";
import type { RangeSpot } from "../poker.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/node_modules/")) {
      return nextResolve(specifier, context);
    }
    if (specifier.endsWith(".css")) {
      return {
        url: "data:text/javascript,export default new Proxy({},{get:(_,p)=>String(p)});",
        shortCircuit: true,
      };
    }
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }
    let candidate: string | null = null;
    if (specifier.startsWith("@/")) {
      candidate = path.resolve("src", specifier.slice(2));
    } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      candidate = fileURLToPath(new URL(specifier, context.parentURL));
    }
    if (candidate?.endsWith(".json") && existsSync(candidate)) {
      return { url: pathToFileURL(candidate).href + "?json-esm", shortCircuit: true };
    }
    if (candidate && !path.extname(candidate)) {
      for (const extension of [".ts", ".tsx"]) {
        if (existsSync(candidate + extension)) {
          return nextResolve(pathToFileURL(candidate + extension).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("?json-esm")) {
      return {
        format: "module",
        shortCircuit: true,
        source: `export default ${readFileSync(fileURLToPath(url.slice(0, -9)), "utf8")};`,
      };
    }
    if (!url.endsWith(".tsx")) return nextLoad(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    };
  },
});

const { NextRequest } = await import("next/server");
const { middleware } = await import("../../middleware.ts");
const { POST: loginPost } = await import("../../app/api/auth/login/route.ts");
const { POST: logoutPost } = await import("../../app/api/auth/logout/route.ts");
const { LoginView } = await import("../../components/LoginView.tsx");
const { PokerStudioApp } = await import("../../components/PokerStudioApp.tsx");

function withEnv(overrides: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const backup: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    backup[key] = process.env[key];
    const value = overrides[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(backup)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

describe("TreinerLM Access Auth — Configuração, Criptografia e Proteção", () => {
  it("resolve estado disabled localmente, enforced com senha e misconfigured na Vercel sem senha", () => {
    assert.equal(getAuthConfigState({}), "disabled");
    assert.equal(getAuthConfigState({ NODE_ENV: "production" }), "disabled");
    assert.equal(getAuthConfigState({ VERCEL: "1" }), "misconfigured");
    assert.equal(getAuthConfigState({ VERCEL_ENV: "production" }), "misconfigured");
    assert.equal(getAuthConfigState({ TREINERLM_REQUIRE_AUTH: "1" }), "misconfigured");
    assert.equal(
      getAuthConfigState({ VERCEL: "1", TREINERLM_ACCESS_PASSWORD: "senha-segura" }),
      "enforced",
    );
    assert.equal(
      getAuthConfigState({ TREINERLM_ACCESS_PASSWORD: "senha-local" }),
      "enforced",
    );
  });

  it("valida senha em tempo constante e rejeita vazio ou divergente", async () => {
    assert.equal(await verifyAccessPassword("PokerMTT#2026", "PokerMTT#2026"), true);
    assert.equal(await verifyAccessPassword("PokerMTT#2025", "PokerMTT#2026"), false);
    assert.equal(await verifyAccessPassword("", "PokerMTT#2026"), false);
    assert.equal(await verifyAccessPassword("PokerMTT#2026", ""), false);
  });

  it("emite e verifica tokens assinados, expira e invalida quando a senha muda", async () => {
    const now = 1_800_000_000_000;
    const token = await createAccessToken("senha-inicial", {
      ttlSeconds: 3600,
      nowMs: now,
    });

    assert.equal(await verifyAccessToken(token, "senha-inicial", { nowMs: now + 1000 }), true);
    assert.equal(await verifyAccessToken(token, "senha-trocada", { nowMs: now + 1000 }), false);
    assert.equal(
      await verifyAccessToken(token, "senha-inicial", { nowMs: now + 3601 * 1000 }),
      false,
    );

    const parts = token.split(".");
    parts[1] = String(Number(parts[1]) + 100);
    assert.equal(
      await verifyAccessToken(parts.join("."), "senha-inicial", { nowMs: now + 1000 }),
      false,
    );

    const withSecret = await createAccessToken("senha-inicial", {
      secret: "segredo-a",
      ttlSeconds: 3600,
      nowMs: now,
    });
    assert.equal(
      await verifyAccessToken(withSecret, "senha-inicial", { secret: "segredo-b", nowMs: now }),
      false,
    );
  });

  it("sanitiza parâmetro next prevenindo open redirect e loop em /login", () => {
    assert.equal(sanitizeNextPath("/"), "/");
    assert.equal(sanitizeNextPath("/?tab=ranges"), "/?tab=ranges");
    assert.equal(sanitizeNextPath("https://evil.invalid"), "/");
    assert.equal(sanitizeNextPath("//evil.invalid"), "/");
    assert.equal(sanitizeNextPath("/\\evil.invalid"), "/");
    assert.equal(sanitizeNextPath("/login"), "/");
    assert.equal(sanitizeNextPath("/api/auth/login"), "/");
    assert.equal(sanitizeNextPath(undefined), "/");
  });

  it("aplica rate limiting após falhas consecutivas e limpa ao acertar", () => {
    const limiter = createLoginRateLimiter({ maxFailures: 3, windowMs: 60_000, lockoutMs: 120_000 });
    const t0 = 1_000_000;
    assert.equal(limiter.check("1.2.3.4", t0).allowed, true);
    assert.equal(limiter.recordFailure("1.2.3.4", t0).locked, false);
    assert.equal(limiter.recordFailure("1.2.3.4", t0 + 100).locked, false);
    const third = limiter.recordFailure("1.2.3.4", t0 + 200);
    assert.equal(third.locked, true);
    assert.equal(limiter.check("1.2.3.4", t0 + 1000).allowed, false);
    assert.equal(limiter.check("1.2.3.4", t0 + 125_000).allowed, true);
    limiter.clear("1.2.3.4");
    assert.equal(limiter.check("1.2.3.4", t0 + 1000).allowed, true);
  });
});

describe("TreinerLM Access Auth — Rotas /api/auth e Middleware Next.js", () => {
  it("POST /api/auth/login valida senha, emite cookie HttpOnly e bloqueia força bruta", async () => {
    await withEnv(
      {
        VERCEL: "1",
        TREINERLM_ACCESS_PASSWORD: "MTT@Treiner2026!",
        TREINERLM_AUTH_SECRET: undefined,
      },
      async () => {
        const crossSite = await loginPost(
          new Request("https://treinerlm.vercel.app/api/auth/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Sec-Fetch-Site": "cross-site",
            },
            body: JSON.stringify({ password: "MTT@Treiner2026!" }),
          }),
        );
        assert.equal(crossSite.status, 403);

        const wrong = await loginPost(
          new Request("https://treinerlm.vercel.app/api/auth/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Forwarded-For": "203.0.113.10",
            },
            body: JSON.stringify({ password: "errada" }),
          }),
        );
        assert.equal(wrong.status, 401);

        const ok = await loginPost(
          new Request("https://treinerlm.vercel.app/api/auth/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Forwarded-For": "203.0.113.10",
            },
            body: JSON.stringify({
              password: "MTT@Treiner2026!",
              remember: true,
              next: "//evil.invalid",
            }),
          }),
        );
        assert.equal(ok.status, 200);
        const body = (await ok.json()) as { ok: boolean; next: string };
        assert.equal(body.ok, true);
        assert.equal(body.next, "/");
        const setCookie = ok.headers.get("set-cookie") ?? "";
        assert.match(setCookie, new RegExp(`${ACCESS_COOKIE_NAME}=v1\\.`));
        assert.match(setCookie, /HttpOnly/i);
        assert.match(setCookie, /Secure/i);
        assert.match(setCookie, /SameSite=Lax/i);

        for (let i = 0; i < LOGIN_MAX_FAILURES - 1; i++) {
          const r = await loginPost(
            new Request("https://treinerlm.vercel.app/api/auth/login", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Forwarded-For": "203.0.113.99",
              },
              body: JSON.stringify({ password: "errada" }),
            }),
          );
          assert.equal(r.status, 401);
        }
        const locked = await loginPost(
          new Request("https://treinerlm.vercel.app/api/auth/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Forwarded-For": "203.0.113.99",
            },
            body: JSON.stringify({ password: "errada" }),
          }),
        );
        assert.equal(locked.status, 429);

        const loggedOut = await logoutPost(
          new Request("https://treinerlm.vercel.app/api/auth/logout", {
            method: "POST",
          }),
        );
        assert.equal(loggedOut.status, 200);
        const outCookie = loggedOut.headers.get("set-cookie") ?? "";
        assert.match(outCookie, new RegExp(`${ACCESS_COOKIE_NAME}=;`));
        assert.match(outCookie, /Max-Age=0/i);
      },
    );
  });

  it("POST /api/auth/login retorna 503 se Vercel estiver sem senha configurada", async () => {
    await withEnv(
      { VERCEL: "1", TREINERLM_ACCESS_PASSWORD: undefined },
      async () => {
        const res = await loginPost(
          new Request("https://treinerlm.vercel.app/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: "algo" }),
          }),
        );
        assert.equal(res.status, 503);
      },
    );
  });

  it("middleware bloqueia rotas sem sessão, libera com cookie válido e mantém modo local aberto", async () => {
    await withEnv(
      { VERCEL: undefined, VERCEL_ENV: undefined, TREINERLM_REQUIRE_AUTH: undefined, TREINERLM_ACCESS_PASSWORD: undefined },
      async () => {
        const res = await middleware(new NextRequest("http://127.0.0.1:3000/"));
        assert.equal(res.status, 200);
      },
    );

    await withEnv(
      { VERCEL: "1", TREINERLM_ACCESS_PASSWORD: undefined },
      async () => {
        const homeRes = await middleware(new NextRequest("https://treinerlm.vercel.app/"));
        assert.equal(homeRes.status, 307);
        assert.match(homeRes.headers.get("location") ?? "", /\/login$/);

        const apiRes = await middleware(new NextRequest("https://treinerlm.vercel.app/api/coach"));
        assert.equal(apiRes.status, 503);
      },
    );

    await withEnv(
      { VERCEL: "1", TREINERLM_ACCESS_PASSWORD: "SenhaCompartilhada#1" },
      async () => {
        const unauthPage = await middleware(
          new NextRequest("https://treinerlm.vercel.app/?tab=ranges"),
        );
        assert.equal(unauthPage.status, 307);
        assert.equal(
          unauthPage.headers.get("location"),
          "https://treinerlm.vercel.app/login?next=%2F%3Ftab%3Dranges",
        );

        const unauthApi = await middleware(
          new NextRequest("https://treinerlm.vercel.app/api/coach"),
        );
        assert.equal(unauthApi.status, 401);

        const unauthReplay = await middleware(
          new NextRequest("https://treinerlm.vercel.app/replays/hu_fold.json"),
        );
        assert.equal(unauthReplay.status, 401);

        const loginPage = await middleware(
          new NextRequest("https://treinerlm.vercel.app/login"),
        );
        assert.equal(loginPage.status, 200);

        const token = await createAccessToken("SenhaCompartilhada#1");
        const authedHome = await middleware(
          new NextRequest("https://treinerlm.vercel.app/", {
            headers: { cookie: `${ACCESS_COOKIE_NAME}=${token}` },
          }),
        );
        assert.equal(authedHome.status, 200);

        const authedReplay = await middleware(
          new NextRequest("https://treinerlm.vercel.app/replays/hu_fold.json", {
            headers: { cookie: `${ACCESS_COOKIE_NAME}=${token}` },
          }),
        );
        assert.equal(authedReplay.status, 200);

        const authedLoginRedirect = await middleware(
          new NextRequest("https://treinerlm.vercel.app/login", {
            headers: { cookie: `${ACCESS_COOKIE_NAME}=${token}` },
          }),
        );
        assert.equal(authedLoginRedirect.status, 307);
        assert.equal(authedLoginRedirect.headers.get("location"), "https://treinerlm.vercel.app/");
      },
    );
  });
});

describe("TreinerLM Access Auth — Interface LoginView e Botão Sair", () => {
  it("renderiza LoginView configurado vs sem variável na Vercel", () => {
    const readyHtml = renderToStaticMarkup(
      createElement(LoginView, { configured: true, nextPath: "/" }),
    );
    assert.match(readyHtml, /TreinerLM/);
    assert.match(readyHtml, /Senha de acesso/);
    assert.match(readyHtml, /Entrar no TreinerLM/);

    const missingHtml = renderToStaticMarkup(
      createElement(LoginView, { configured: false, nextPath: "/" }),
    );
    assert.match(missingHtml, /TREINERLM_ACCESS_PASSWORD/);
    assert.doesNotMatch(missingHtml, /Entrar no TreinerLM/);
  });

  it("exibe o botão Sair na barra do TreinerLM apenas quando authEnabled=true", () => {
    const spots = (rangesData as unknown as { spots: RangeSpot[] }).spots.slice(0, 5);
    const openHtml = renderToStaticMarkup(
      createElement(PokerStudioApp, {
        spots,
        totalChunks: 0,
        videos: [],
        authEnabled: false,
      }),
    );
    assert.doesNotMatch(openHtml, /Encerrar sessão/);

    const protectedHtml = renderToStaticMarkup(
      createElement(PokerStudioApp, {
        spots,
        totalChunks: 0,
        videos: [],
        authEnabled: true,
      }),
    );
    assert.match(protectedHtml, /Encerrar sessão/);
    assert.match(protectedHtml, /Sair/);
  });
});
