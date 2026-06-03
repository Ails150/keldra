"use client";

// Real backend for the MER cross-device field loop. Anon key + RLS scoped to
// project='MER'. Photos go to a PRIVATE bucket and are shown via short-lived
// signed URLs. Realtime broadcasts inserts/deletes to every subscribed device.
//
// Required Supabase setup (created in the dashboard):
//   - private bucket  : mer-field-photos
//   - table           : public.mer_field_events  (RLS: anon select/insert/delete where project='MER')
//   - realtime        : table added to supabase_realtime publication

import { createClient } from "@/lib/supabase/client";

export const MER_BUCKET = "mer-field-photos";
export const MER_TABLE = "mer_field_events";
export const FIELD_BURN_PER_DAY = 4000;

export type MerFieldEvent = {
  id: string;
  project: string;
  asset_id: string | null;
  kind: string;
  comment: string | null;
  photo_path: string | null;
  actor: string;
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

// Upload the photo (if any) to the private bucket, then insert the row. Returns
// the new id. Throws on insert failure so the caller can surface it.
export async function submitFieldEvent(input: {
  assetId?: string | null;
  comment?: string | null;
  photoBlob?: Blob | null;
  actor?: string;
}): Promise<{ id: string }> {
  const supabase = createClient();
  const id = uuid();
  let photo_path: string | null = null;

  if (input.photoBlob) {
    const path = `mer/${id}.jpg`;
    const { error: upErr } = await supabase.storage
      .from(MER_BUCKET)
      .upload(path, input.photoBlob, { contentType: "image/jpeg", upsert: true });
    if (!upErr) photo_path = path;
    else console.warn("photo upload failed:", upErr.message);
  }

  const { error } = await supabase.from(MER_TABLE).insert({
    id,
    project: "MER",
    asset_id: input.assetId ?? null,
    kind: "red_tag",
    comment: input.comment ?? null,
    photo_path,
    actor: input.actor ?? "Field — Site Lead",
    burn_per_day: FIELD_BURN_PER_DAY,
  });
  if (error) throw error;
  return { id };
}

export async function listFieldEvents(): Promise<MerFieldEvent[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from(MER_TABLE)
    .select("*")
    .eq("project", "MER")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MerFieldEvent[];
}

export async function clearFieldEvents(): Promise<void> {
  const supabase = createClient();
  await supabase.from(MER_TABLE).delete().eq("project", "MER");
}

export async function deleteFieldEvent(id: string): Promise<void> {
  const supabase = createClient();
  await supabase.from(MER_TABLE).delete().eq("id", id);
}

export async function signedPhotoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = createClient();
  const { data } = await supabase.storage.from(MER_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// Subscribe to inserts/deletes for MER. Returns an unsubscribe fn.
export function subscribeFieldEvents(handlers: {
  onInsert: (e: MerFieldEvent) => void;
  onDelete: (id: string) => void;
}): () => void {
  const supabase = createClient();
  const ch = supabase
    .channel("mer-field-events")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: MER_TABLE },
      (payload) => handlers.onInsert(payload.new as MerFieldEvent),
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: MER_TABLE },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) handlers.onDelete(old.id);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(ch);
  };
}
