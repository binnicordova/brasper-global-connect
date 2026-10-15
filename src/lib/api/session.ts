import { readJson, removeKey, writeJson } from "@/lib/local-store";
import { endpoints } from "./config";
import { ApiError } from "./errors";

/**
 * Clients are anonymous Firebase Auth users, created silently over the REST API. The session
 * lives in this browser's storage: it is the only key to the client's own orders.
 */
export type Session = { uid: string; idToken: string; refreshToken: string; expiresAt: number };

export const SESSION_KEY = "brasper.session.v1";
const SKEW_MS = 60_000;

let inflight: Promise<Session> | null = null;

const isFresh = (s: Session | null): s is Session => !!s && s.expiresAt - SKEW_MS > Date.now();

export const storedSession = (): Session | null => {
  const s = readJson<Session | null>(SESSION_KEY, null);
  return s && s.uid && s.idToken && s.refreshToken ? s : null;
};

type AuthBody = {
  // accounts:signUp
  idToken?: string;
  localId?: string;
  refreshToken?: string;
  expiresIn?: string;
  // securetoken token refresh
  id_token?: string;
  user_id?: string;
  refresh_token?: string;
  expires_in?: string;
} | null;

async function post(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: AuthBody }> {
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", ...init });
  } catch {
    throw new ApiError("network");
  }
  const body = (await response.json().catch(() => null)) as AuthBody;
  return { ok: response.ok, status: response.status, body };
}

function save(session: Session): Session {
  writeJson(SESSION_KEY, session);
  return session;
}

async function signUp(): Promise<Session> {
  const { ok, body } = await post(endpoints.signUp(), {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!ok || !body?.idToken) throw new ApiError("sign-in-required");
  return save({
    uid: body.localId ?? "",
    idToken: body.idToken,
    refreshToken: body.refreshToken ?? "",
    expiresAt: Date.now() + Number(body.expiresIn ?? 3600) * 1000,
  });
}

async function refresh(current: Session): Promise<Session | null> {
  const { ok, status, body } = await post(endpoints.refresh(), {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
    }),
  });
  if (status >= 500) throw new ApiError("network"); // never replace the account on a server hiccup
  if (!ok || !body?.id_token) return null; // refresh token revoked: the account is gone
  return save({
    uid: body.user_id ?? current.uid,
    idToken: body.id_token,
    refreshToken: body.refresh_token ?? current.refreshToken,
    expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000,
  });
}

/** A valid session, refreshing or creating it when needed. `force` skips the freshness check. */
export function getSession(force = false): Promise<Session> {
  const stored = storedSession();
  if (!force && isFresh(stored)) return Promise.resolve(stored);
  inflight ??= (async () => {
    try {
      return (stored && (await refresh(stored))) || (await signUp());
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function clearSession(): void {
  removeKey(SESSION_KEY);
}
