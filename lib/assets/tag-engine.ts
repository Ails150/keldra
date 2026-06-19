import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { appendAssetTagEvent } from "./tag-events";
import { freshChecklist, nextTag, type ChecklistItem, type Tag } from "./checklist";

type Admin = ReturnType<typeof createAdminClient>;
export type EngineResult = { ok: true } | { ok: false; status: number; error: string };

// Govern the status enum from the live facts. Pure so it can be unit-asserted.
export function computeAssetStatus(
  tag: Tag,
  checklist: ChecklistItem[],
  targetDate: string | null,
  hasOpenBlocker: boolean,
): "achieved" | "in_progress" | "late" | "blocked" {
  if (tag === "green") return "achieved";
  if (hasOpenBlocker) return "blocked";
  const incomplete = checklist.some((i) => i.status !== "approved");
  if (incomplete && targetDate && targetDate < new Date().toISOString().slice(0, 10)) return "late";
  return "in_progress";
}

// Is any non-closed blocker linked to this asset (by task_code or linked_assets)?
async function hasOpenBlocker(admin: Admin, orgId: string, assetId: string): Promise<boolean> {
  const { data } = await admin
    .from("blockers")
    .select("id, task_code, linked_assets, state")
    .eq("org_id", orgId)
    .neq("state", "closed");
  return (data ?? []).some((b) => {
    const r = b as { task_code: string | null; linked_assets: string[] | null };
    return r.task_code === assetId || (Array.isArray(r.linked_assets) && r.linked_assets.includes(assetId));
  });
}

async function loadTag(admin: Admin, orgId: string, assetId: string) {
  return admin
    .from("asset_tags")
    .select("tag, status, target_date, next_checklist")
    .eq("org_id", orgId)
    .eq("asset_id", assetId)
    .maybeSingle<{ tag: Tag; status: string; target_date: string | null; next_checklist: ChecklistItem[] }>();
}

// Approve / un-approve one checklist item, then re-govern the asset's status.
export async function setChecklistItem(
  admin: Admin,
  p: { orgId: string; assetId: string; label: string; approved: boolean },
): Promise<EngineResult> {
  const { data: row } = await loadTag(admin, p.orgId, p.assetId);
  if (!row) return { ok: false, status: 404, error: "Asset not tagged for this org." };
  const checklist = Array.isArray(row.next_checklist) ? row.next_checklist : [];
  const idx = checklist.findIndex((i) => i.label === p.label);
  if (idx === -1) return { ok: false, status: 404, error: "Checklist item not found." };
  const next: ChecklistItem[] = checklist.map((i, n) => (n === idx ? { ...i, status: (p.approved ? "approved" : "outstanding") as "approved" | "outstanding" } : i));
  const status = computeAssetStatus(row.tag, next, row.target_date, await hasOpenBlocker(admin, p.orgId, p.assetId));
  const { error } = await admin.from("asset_tags").update({ next_checklist: next, status }).eq("org_id", p.orgId).eq("asset_id", p.assetId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}

// Advance one step up the ladder — STRICT: green is terminal, and the current
// tag's checklist must be fully approved first. Appends a transition event and
// regenerates the next-tag checklist.
export async function advanceAssetTag(
  admin: Admin,
  p: { orgId: string; assetId: string; actorName?: string | null; actorOrg?: string | null },
): Promise<EngineResult> {
  const { data: row } = await loadTag(admin, p.orgId, p.assetId);
  if (!row) return { ok: false, status: 404, error: "Asset not tagged for this org." };
  const target = nextTag(row.tag);
  if (!target) return { ok: false, status: 409, error: "Asset is already Green (operational) — nothing to advance." };
  const checklist = Array.isArray(row.next_checklist) ? row.next_checklist : [];
  const outstanding = checklist.filter((i) => i.status !== "approved").length;
  if (outstanding > 0) {
    return { ok: false, status: 409, error: `Cannot advance to ${target}: ${outstanding} checklist item(s) outstanding.` };
  }

  const achievedDate = new Date().toISOString().slice(0, 10);
  const newChecklist = freshChecklist(target);
  const targetDate = target === "green" ? null : new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const status = computeAssetStatus(target, newChecklist, targetDate, await hasOpenBlocker(admin, p.orgId, p.assetId));

  const { error } = await admin
    .from("asset_tags")
    .update({ tag: target, status, achieved_date: achievedDate, target_date: targetDate, next_checklist: newChecklist })
    .eq("org_id", p.orgId)
    .eq("asset_id", p.assetId);
  if (error) return { ok: false, status: 500, error: error.message };

  await appendAssetTagEvent(admin, {
    orgId: p.orgId,
    assetId: p.assetId,
    eventType: `${target}_achieved`,
    actorName: p.actorName ?? "Commissioning Lead",
    actorOrg: p.actorOrg ?? "Main Contractor",
    payload: { to_tag: target, what: `Advanced to ${target} — checklist complete`, why: "All items approved", how: "Tag advance" },
  });
  return { ok: true };
}
