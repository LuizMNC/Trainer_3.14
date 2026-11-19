const textEncoder = new TextEncoder();

export const ACCESS_COOKIE_NAME = "treinerlm_access_v1";
export const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dias
export const SHORT_SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 horas (cookie de sessão)
export const LOGIN_MAX_FAILURES = 8;
export const LOGIN_WINDOW_MS = 5 * 60 * 1000;
export const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

export type AuthConfigState = "enforced" | "misconfigured" | "disabled";

export type AuthEnvLike = Record<string, string | undefined>;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function getAuthConfigState(env: AuthEnvLike = process.env): AuthConfigState {
  const password = env.TREINERLM_ACCESS_PASSWORD ?? "";
  if (password.length > 0) {
    return "enforced";
  }
  const runningOnVercel = env.VERCEL === "1" || Boolean(env.VERCEL_ENV);
  const authExplicitlyRequired = env.TREINERLM_REQUIRE_AUTH === "1";
  if (runningOnVercel || authExplicitlyRequired) {
    return "misconfigured";
  }
  return "disabled";
}

export function isSecureRequest(request: Request, env: AuthEnvLike = process.env): boolean {
  if (env.VERCEL === "1") return true;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function sanitizeNextPath(rawNext: string | null | undefined): string {
  if (!rawNext || typeof rawNext !== "string") return "/";
  const trimmed = rawNext.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return "/";
  }
  // Bloqueia caracteres de controle e esquemas disfarçados
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) {
    return "/";
  }
  try {
    const parsed = new URL(trimmed, "http://localhost");
    if (parsed.origin !== "http://localhost") return "/";
    if (parsed.pathname === "/login" || parsed.pathname.startsWith("/api/auth")) {
      return "/";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

async function importHmacKey(password: string, secret?: string): Promise<CryptoKey> {
  const keyMaterial = secret && secret.length > 0
    ? `${secret}:${password}`
    : `treinerlm-access-v1:${password}`;
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(textEncoder.encode(keyMaterial)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function verifyAccessPassword(
  candidate: string,
  expectedPassword: string,
): Promise<boolean> {
  if (!candidate || !expectedPassword) return false;
  const [candidateDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", toArrayBuffer(textEncoder.encode(candidate))),
    crypto.subtle.digest("SHA-256", toArrayBuffer(textEncoder.encode(expectedPassword))),
  ]);
  const a = new Uint8Array(candidateDigest);
  const b = new Uint8Array(expectedDigest);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function createAccessToken(
  password: string,
  options: {
    secret?: string;
    ttlSeconds?: number;
    nowMs?: number;
  } = {},
): Promise<string> {
  if (!password) {
    throw new Error("TREINERLM_ACCESS_PASSWORD não configurada.");
  }
  const nowSec = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const ttlSeconds = Math.max(60, Math.floor(options.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS));
  const expSec = nowSec + ttlSeconds;
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const payload = `v1.${expSec}.${toHex(nonceBytes)}`;
  const key = await importHmacKey(password, options.secret);
  const sig = await crypto.subtle.sign("HMAC", key, toArrayBuffer(textEncoder.encode(payload)));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifyAccessToken(
  token: string | null | undefined,
  password: string,
  options: {
    secret?: string;
    nowMs?: number;
  } = {},
): Promise<boolean> {
  if (!token || !password) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [version, expRaw, nonceHex, sigB64] = parts;
  if (version !== "v1") return false;
  if (!/^\d{1,12}$/.test(expRaw)) return false;
  if (!/^[0-9a-f]{32}$/.test(nonceHex)) return false;
  const expSec = Number(expRaw);
  const nowSec = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (!Number.isSafeInteger(expSec) || expSec <= nowSec) {
    return false;
  }
  const sigBytes = fromBase64Url(sigB64);
  if (!sigBytes || sigBytes.length !== 32) return false;
  const payload = `${version}.${expRaw}.${nonceHex}`;
  const key = await importHmacKey(password, options.secret);
  return crypto.subtle.verify(
    "HMAC",
    key,
    toArrayBuffer(sigBytes),
    toArrayBuffer(textEncoder.encode(payload)),
  );
}

export function extractClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "unknown";
}

interface FailureBucket {
  timestamps: number[];
  lockedUntil: number;
}

export interface LoginRateLimiter {
  check(ip: string, nowMs?: number): { allowed: boolean; retryAfterSeconds: number };
  recordFailure(ip: string, nowMs?: number): { locked: boolean; retryAfterSeconds: number };
  clear(ip: string): void;
}

export function createLoginRateLimiter(options: {
  maxFailures?: number;
  windowMs?: number;
  lockoutMs?: number;
  maxTrackedIps?: number;
} = {}): LoginRateLimiter {
  const maxFailures = options.maxFailures ?? LOGIN_MAX_FAILURES;
  const windowMs = options.windowMs ?? LOGIN_WINDOW_MS;
  const lockoutMs = options.lockoutMs ?? LOGIN_LOCKOUT_MS;
  const maxTrackedIps = options.maxTrackedIps ?? 1000;
  const buckets = new Map<string, FailureBucket>();

  function pruneIfNeeded() {
    if (buckets.size <= maxTrackedIps) return;
    const oldestKey = buckets.keys().next().value;
    if (oldestKey !== undefined) {
      buckets.delete(oldestKey);
    }
  }

  return {
    check(ip: string, nowMs = Date.now()) {
      const bucket = buckets.get(ip);
      if (!bucket) return { allowed: true, retryAfterSeconds: 0 };
      if (bucket.lockedUntil > nowMs) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((bucket.lockedUntil - nowMs) / 1000)),
        };
      }
      bucket.timestamps = bucket.timestamps.filter((t) => nowMs - t <= windowMs);
      if (bucket.timestamps.length === 0) {
        buckets.delete(ip);
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
    recordFailure(ip: string, nowMs = Date.now()) {
      let bucket = buckets.get(ip);
      if (!bucket) {
        pruneIfNeeded();
        bucket = { timestamps: [], lockedUntil: 0 };
        buckets.set(ip, bucket);
      }
      bucket.timestamps = bucket.timestamps.filter((t) => nowMs - t <= windowMs);
      bucket.timestamps.push(nowMs);
      if (bucket.timestamps.length >= maxFailures) {
        bucket.lockedUntil = nowMs + lockoutMs;
        return {
          locked: true,
          retryAfterSeconds: Math.max(1, Math.ceil(lockoutMs / 1000)),
        };
      }
      return { locked: false, retryAfterSeconds: 0 };
    },
    clear(ip: string) {
      buckets.delete(ip);
    },
  };
}
