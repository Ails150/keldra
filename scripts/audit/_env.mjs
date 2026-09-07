// Shared env + client bootstrap for the Keldra audit harness.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const env = Object.fromEntries(
  readFileSync(resolve(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
export const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

// The one live project. There is NO keldra-dev — see docs/audit/REPORT.md.
export const PROJECT_REF = "fmeixgnxkcapxyhrjhvm";
// Real customer org — read-only in every probe, never a write target.
export const ARDMAC = "437ec2d5-0c94-4ba8-b8bb-328c3f780774";

export function rest(path, { key = ANON, token, method = "GET", body, prefer } = {}) {
  const headers = { apikey: key, Authorization: `Bearer ${token ?? key}` };
  if (body) headers["Content-Type"] = "application/json";
  if (prefer) headers["Prefer"] = prefer;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

// Build the @supabase/ssr session cookie (v0.10: "base64-" + base64url(JSON),
// chunked at 3180 chars into name.0, name.1, ...). Routes that authenticate with
// getSessionState() read cookies, NOT the Authorization header — probing those
// with a Bearer token yields a 403 that proves nothing, so the suite needs this.
const MAX_CHUNK = 3180;
export function sessionCookieHeader(session) {
  const name = `sb-${PROJECT_REF}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  if (value.length <= MAX_CHUNK) return `${name}=${value}`;
  const parts = [];
  for (let i = 0; i * MAX_CHUNK < value.length; i++) {
    parts.push(`${name}.${i}=${value.slice(i * MAX_CHUNK, (i + 1) * MAX_CHUNK)}`);
  }
  return parts.join("; ");
}
