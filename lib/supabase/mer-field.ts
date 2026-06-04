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

// Workspace (company) id — the scope for ALL field data. Resolved from ?w=<id>
// in the URL (wins + persists, so a phone opening the Field link joins that
// workspace), else the stored id, else a fresh one (so different prospect
// companies stay isolated). Everyone on the same workspace shares one dataset;
// the PM dashboard and the field phones that joined it see each other live.
export function getWorkspaceId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("w");
    if (fromUrl) {
      window.localStorage.setItem(WORKSPACE_KEY, fromUrl);
      return fromUrl;
    }
    let id = window.localStorage.getItem(WORKSPACE_KEY);
    if (!id) {
      id = uuid();
      window.localStorage.setItem(WORKSPACE_KEY, id);
    }
    return id;
  } catch {
    return "nows";
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
  const { error } = await supabase.from(MER_TABLE).insert({
    id,
    project: "MER",
    session_id: getWorkspaceId(),
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
  });
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

export async function listFieldEvents(): Promise<MerFieldEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from(MER_TABLE).select("*").eq("project", "MER").eq("session_id", getWorkspaceId()).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MerFieldEvent[];
}

// Full logged history for one asset, oldest first — scoped to this visitor.
export async function listAssetHistory(assetId: string): Promise<MerFieldEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from(MER_TABLE).select("*").eq("project", "MER").eq("session_id", getWorkspaceId()).eq("asset_id", assetId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MerFieldEvent[];
}

// Reset clears ONLY this visitor's field rows.
export async function clearFieldEvents(): Promise<void> {
  const supabase = createClient();
  await supabase.from(MER_TABLE).delete().eq("project", "MER").eq("session_id", getWorkspaceId());
}

export async function deleteFieldEvent(id: string): Promise<void> {
  const supabase = createClient();
  await supabase.from(MER_TABLE).delete().eq("id", id).eq("session_id", getWorkspaceId());
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
  const ch = supabase
    .channel(`mer-field-events-${++_channelSeq}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: MER_TABLE, filter: `session_id=eq.${getWorkspaceId()}` }, (p) => handlers.onInsert(p.new as MerFieldEvent))
    .on("postgres_changes", { event: "DELETE", schema: "public", table: MER_TABLE }, (p) => { const o = p.old as { id?: string }; if (o?.id) handlers.onDelete(o.id); })
    .subscribe();
  return () => { void supabase.removeChannel(ch); };
}
