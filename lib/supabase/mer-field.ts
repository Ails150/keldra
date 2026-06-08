"use client";

// Real backend spine for the MER demo. mer_field_events is a per-asset HISTORY
// LOG: anyone on site logs entries (red_tag / comment / photo / update /
// escalated / response) against an asset. Red tags record who they're WITH
// (waiting-on / owner) and which gate they block. Gates derive their blocking
// list live from the open red tags. Anon key + RLS scoped to project='MER';
// photos in a private bucket via signed URLs; Realtime broadcasts to every
// device. ardmac-pitch is never touched.
//
// Supabase setup (dashboard): private bucket mer-field-photos; table
// public.mer_field_events with the columns below + anon RLS (select/insert/
// delete where project='MER'); table in the supabase_realtime publication.

import { createClient } from "@/lib/supabase/client";

export const MER_BUCKET = "mer-field-photos";
export const MER_TABLE = "mer_field_events";
export const FIELD_BURN_PER_DAY = 4000;

export type EntryKind = "red_tag" | "comment" | "photo" | "update" | "escalated" | "response" | "resolved";

export type MerFieldEvent = {
  id: string;
  project: string;
  asset_id: string | null; // the task/asset this entry is about
  kind: string;
  comment: string | null;
  photo_path: string | null;
  actor: string; // who logged it
  role: string | null;
  with_party: string | null; // red tag: who it's with (waiting-on / owner)
  gate: string | null; // red tag: which gate it blocks (e.g. 'C')
  parent_id: string | null;
  burn_per_day: number;
  created_at: string;
};

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const WORKSPACE_KEY = "mer_workspace_id";
export const DEFAULT_WORKSPACE = "demo";

// Workspace (company) id — the scope for ALL field data.
//   ?w=<id> in the URL  -> that private named workspace (wins + persists), so a
//                          phone opening the Field link joins it.
//   no ?w=              -> the shared common workspace ("demo"). A laptop
//                          dashboard and a phone field app, both opened plain,
//                          share automatically with zero setup. A cold load
//                          always lands here even if an old (random) id is in
//                          localStorage — we overwrite it.
export function getWorkspaceId(): string {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("w");
    if (fromUrl) {
      window.localStorage.setItem(WORKSPACE_KEY, fromUrl);
      return fromUrl;
    }
    window.localStorage.setItem(WORKSPACE_KEY, DEFAULT_WORKSPACE);
    return DEFAULT_WORKSPACE;
  } catch {
    return DEFAULT_WORKSPACE;
  }
}

// The phone join-link carrying the CURRENT workspace.
export function workspaceFieldUrl(): string {
  if (typeof window === "undefined") return "/field/capture";
  return `${window.location.origin}/field/capture?w=${encodeURIComponent(getWorkspaceId())}`;
}

async function uploadPhoto(id: string, blob: Blob): Promise<string | null> {
  const supabase = createClient();
  const path = `mer/${id}.jpg`;
  const { error } = await supabase.storage.from(MER_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) { console.warn("photo upload failed:", error.message); return null; }
  return path;
}

// ----------------------------------------------------------------------------
// SCOPE — the org/workspace a read, write or subscription is bound to.
//
//   logged-in org member  -> { mode:'org', orgId, userId, fullName }
//   logged-in superadmin  -> { mode:'org', orgId:null }  (RLS returns every org)
//   anonymous visitor     -> { mode:'workspace', workspaceId }  (legacy ?w= demo)
//
// Fully defensive: anything unexpected (no session, users table absent before
// the migration runs, query error) falls back to the workspace demo, so the
// public app.keldra.io demo keeps working unchanged.
// ----------------------------------------------------------------------------
export type OrgContext = {
  userId: string;
  orgId: string | null;
  role: string;
  fullName: string | null;
  email: string | null;
};

type Scope =
  | { mode: "org"; orgId: string | null; userId: string; fullName: string | null }
  | { mode: "workspace"; workspaceId: string };

export async function getOrgContext(): Promise<OrgContext | null> {
  if (typeof window === "undefined") return null;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("users")
      .select("org_id, role, full_name")
      .eq("id", user.id)
      .maybeSingle();
    if (error) return null; // table not migrated yet — treat as anonymous
    return {
      userId: user.id,
      orgId: (data?.org_id as string | null) ?? null,
      role: (data?.role as string) ?? "member",
      fullName: (data?.full_name as string | null) ?? null,
      email: user.email ?? null,
    };
  } catch {
    return null;
  }
}

async function resolveScope(): Promise<Scope> {
  const ctx = await getOrgContext();
  if (ctx && (ctx.orgId || ctx.role === "superadmin")) {
    return { mode: "org", orgId: ctx.orgId, userId: ctx.userId, fullName: ctx.fullName };
  }
  return { mode: "workspace", workspaceId: getWorkspaceId() };
}

// Log any history entry against an asset. Returns the new id.
export async function logEntry(input: {
  assetId: string;
  kind: EntryKind;
  comment?: string | null;
  photoBlob?: Blob | null;
  actor: string;
  role?: string | null;
  withParty?: string | null;
  gate?: string | null;
  parentId?: string | null;
  burnPerDay?: number;
}): Promise<{ id: string }> {
  const supabase = createClient();
  const id = uuid();
  const photo_path = input.photoBlob ? await uploadPhoto(id, input.photoBlob) : null;
  const scope = await resolveScope();
  const row: Record<string, unknown> = {
    id,
    project: "MER",
    asset_id: input.assetId,
    kind: input.kind,
    comment: input.comment ?? null,
    photo_path,
    actor: input.actor,
    role: input.role ?? null,
    with_party: input.withParty ?? null,
    gate: input.gate ?? null,
    parent_id: input.parentId ?? null,
    burn_per_day: input.kind === "red_tag" ? (input.burnPerDay ?? FIELD_BURN_PER_DAY) : 0,
  };
  if (scope.mode === "org") {
    // org_id / actor_user_id also default from the JWT server-side, but we set
    // them explicitly so it's unambiguous which org & user logged the entry.
    row.org_id = scope.orgId;
    row.actor_user_id = scope.userId;
    if (scope.fullName) row.actor = scope.fullName;
  } else {
    row.session_id = scope.workspaceId;
  }
  const { error } = await supabase.from(MER_TABLE).insert(row);
  if (error) throw error;
  return { id };
}

// A red tag raised from the field.
export function raiseRedTag(input: { assetId: string; comment?: string | null; photoBlob?: Blob | null; actor?: string; withParty?: string | null; gate?: string | null; }) {
  return logEntry({ ...input, kind: "red_tag", actor: input.actor ?? "Field — Site Lead" });
}

// Escalate a red tag — appends an entry threaded under it.
export function escalateRedTag(input: { assetId: string; parentId: string; toRole: string; actor?: string }) {
  return logEntry({ assetId: input.assetId, kind: "escalated", parentId: input.parentId, role: input.toRole, actor: input.actor ?? "Commissioning Lead", comment: `Escalated to ${input.toRole}` });
}

// Scope a read query: org members -> their org_id (superadmin -> every org via
// RLS, no filter); anonymous -> their ?w= workspace via session_id.
function applyScope<T extends { eq: (c: string, v: string) => T }>(q: T, scope: Scope): T {
  if (scope.mode === "org") {
    return scope.orgId ? q.eq("org_id", scope.orgId) : q;
  }
  return q.eq("session_id", scope.workspaceId);
}

export async function listFieldEvents(): Promise<MerFieldEvent[]> {
  const supabase = createClient();
  const scope = await resolveScope();
  const base = supabase.from(MER_TABLE).select("*").eq("project", "MER");
  const { data, error } = await applyScope(base, scope).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MerFieldEvent[];
}

// Full logged history for one asset, oldest first — scoped to org / workspace.
export async function listAssetHistory(assetId: string): Promise<MerFieldEvent[]> {
  const supabase = createClient();
  const scope = await resolveScope();
  const base = supabase.from(MER_TABLE).select("*").eq("project", "MER").eq("asset_id", assetId);
  const { data, error } = await applyScope(base, scope).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MerFieldEvent[];
}

// Reset clears ONLY the caller's own scope (their org, or their ?w= workspace).
// Superadmin (orgId null) is a no-op here — we never bulk-delete every org.
export async function clearFieldEvents(): Promise<void> {
  const supabase = createClient();
  const scope = await resolveScope();
  if (scope.mode === "org") {
    if (!scope.orgId) return;
    await supabase.from(MER_TABLE).delete().eq("project", "MER").eq("org_id", scope.orgId);
  } else {
    await supabase.from(MER_TABLE).delete().eq("project", "MER").eq("session_id", scope.workspaceId);
  }
}

export async function deleteFieldEvent(id: string): Promise<void> {
  const supabase = createClient();
  const scope = await resolveScope();
  // RLS already restricts to the caller's org; the extra scope filter keeps the
  // legacy workspace path from deleting another visitor's row.
  const q = supabase.from(MER_TABLE).delete().eq("id", id);
  await applyScope(q, scope);
}

export async function signedPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = createClient();
  const { data } = await supabase.storage.from(MER_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

let _channelSeq = 0;

// Each caller gets its OWN channel topic — Supabase reuses a channel by name and
// rejects adding postgres_changes callbacks after subscribe(), so multiple
// subscribers (provider + asset panel + history page) must not share a name.
export function subscribeFieldEvents(handlers: { onInsert: (e: MerFieldEvent) => void; onDelete: (id: string) => void }): () => void {
  const supabase = createClient();
  // Scope resolution is async; set the channel up once we know it, and let the
  // returned unsubscribe tear down whatever exists by then.
  let ch: ReturnType<typeof supabase.channel> | null = null;
  let cancelled = false;
  void (async () => {
    const scope = await resolveScope();
    if (cancelled) return;
    // org member -> org_id filter; superadmin (orgId null) -> no filter (RLS
    // still limits the stream to rows they can SELECT); anon -> session_id.
    const insertFilter =
      scope.mode === "org"
        ? scope.orgId
          ? `org_id=eq.${scope.orgId}`
          : undefined
        : `session_id=eq.${scope.workspaceId}`;
    const insertOpts = insertFilter
      ? { event: "INSERT" as const, schema: "public", table: MER_TABLE, filter: insertFilter }
      : { event: "INSERT" as const, schema: "public", table: MER_TABLE };
    ch = supabase
      .channel(`mer-field-events-${++_channelSeq}`)
      .on("postgres_changes", insertOpts, (p) => handlers.onInsert(p.new as MerFieldEvent))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: MER_TABLE }, (p) => { const o = p.old as { id?: string }; if (o?.id) handlers.onDelete(o.id); })
      .subscribe();
  })();
  return () => { cancelled = true; if (ch) void supabase.removeChannel(ch); };
}
