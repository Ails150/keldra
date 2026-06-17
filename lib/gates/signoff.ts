import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// Who may produce a sign-off evidence record. Managers + org admins (+ super).
// Members/viewers can't sign; field users live in /field, not the dashboard.
export function canSignOff(role: string | null | undefined): boolean {
  return role === "manager" || role === "org_admin" || role === "superadmin";
}

export type GateSignoff = {
  id: string;
  gate_code: string;
  item_label: string;
  status: "outstanding" | "signed";
  signed_by_user_id: string | null;
  signed_by_name: string | null;
  signed_by_role: string | null;
  signature_kind: "typed" | "drawn" | null;
  signature_text: string | null;
  signature_path: string | null;
  signed_at: string | null;
  task_code: string | null;
};

export type GateSignoffSummary = { signed: number; total: number; cleared: boolean };

const BUCKET = "gate-signatures";
const SELECT = "id, gate_code, item_label, status, signed_by_user_id, signed_by_name, signed_by_role, signature_kind, signature_text, signature_path, signed_at, task_code";

// All signoff rows for an org, grouped by gate_code (oldest item label first).
export async function loadGateSignoffs(admin: Admin, orgId: string): Promise<Map<string, GateSignoff[]>> {
  const { data } = await admin
    .from("gate_signoffs")
    .select(SELECT)
    .eq("org_id", orgId)
    .order("gate_code")
    .order("item_label");
  const byGate = new Map<string, GateSignoff[]>();
  for (const r of (data ?? []) as GateSignoff[]) {
    const g = byGate.get(r.gate_code) ?? [];
    g.push(r);
    byGate.set(r.gate_code, g);
  }
  return byGate;
}

// "X / Y signed off" + cleared, recomputed from the real rows — never static.
export function summarise(items: GateSignoff[] | undefined): GateSignoffSummary {
  const list = items ?? [];
  const total = list.length;
  const signed = list.filter((i) => i.status === "signed").length;
  return { signed, total, cleared: total > 0 && signed === total };
}

export type SignOffActor = { userId: string; orgId: string; role: string; fullName: string | null };
export type SignOffInput = {
  gateCode: string;
  itemLabel: string;
  signatureKind: "typed" | "drawn";
  signatureText?: string | null;
  signatureDataUrl?: string | null;
};
export type SignOffResult =
  | { ok: true; signoff: GateSignoff }
  | { ok: false; status: number; error: string };

// Sign off ONE outstanding item. Identity is taken from `actor` (the verified
// session) — callers must NOT pass identity from the request body. Refuses a
// second sign-off (immutable). A drawn signature is stored to a private,
// org-scoped path keyed by the row id (so it can't be overwritten).
export async function signOffGateItem(
  admin: Admin,
  actor: SignOffActor,
  input: SignOffInput,
): Promise<SignOffResult> {
  if (!canSignOff(actor.role)) return { ok: false, status: 403, error: "Your role can't sign off gate items." };
  const gateCode = (input.gateCode ?? "").trim();
  const itemLabel = (input.itemLabel ?? "").trim();
  if (!gateCode || !itemLabel) return { ok: false, status: 400, error: "Missing gate or item." };
  if (input.signatureKind === "typed" && !(input.signatureText ?? "").trim())
    return { ok: false, status: 400, error: "A typed signature is required." };
  if (input.signatureKind === "drawn" && !(input.signatureDataUrl ?? "").startsWith("data:image/"))
    return { ok: false, status: 400, error: "A drawn signature image is required." };

  // The target item, scoped to the ACTOR's org (the only org it can touch).
  const { data: row } = await admin
    .from("gate_signoffs")
    .select("id, status")
    .eq("org_id", actor.orgId)
    .eq("gate_code", gateCode)
    .eq("item_label", itemLabel)
    .maybeSingle<{ id: string; status: string }>();
  if (!row) return { ok: false, status: 404, error: "Item not found for this gate." };
  if (row.status === "signed") return { ok: false, status: 409, error: "Already signed — this record is immutable." };

  let signaturePath: string | null = null;
  if (input.signatureKind === "drawn") {
    const m = (input.signatureDataUrl ?? "").match(/^data:(image\/\w+);base64,([\s\S]+)$/);
    if (!m) return { ok: false, status: 400, error: "Bad signature image." };
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.byteLength > 1_500_000) return { ok: false, status: 413, error: "Signature image too large." };
    signaturePath = `${actor.orgId}/${row.id}.png`;
    const up = await admin.storage.from(BUCKET).upload(signaturePath, bytes, { contentType: m[1], upsert: false });
    if (up.error) return { ok: false, status: 500, error: `Signature upload failed: ${up.error.message}` };
  }

  // Only an OUTSTANDING row can be signed (belt-and-braces with the DB trigger,
  // which makes a signed row immutable even to the service role).
  const { data: updated, error } = await admin
    .from("gate_signoffs")
    .update({
      status: "signed",
      signed_by_user_id: actor.userId,
      signed_by_name: actor.fullName,
      signed_by_role: actor.role,
      signature_kind: input.signatureKind,
      signature_text: input.signatureKind === "typed" ? (input.signatureText ?? "").trim() : null,
      signature_path: signaturePath,
      signed_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "outstanding")
    .select(SELECT)
    .maybeSingle<GateSignoff>();
  if (error || !updated) return { ok: false, status: 409, error: error?.message ?? "Sign-off failed (already signed?)." };
  return { ok: true, signoff: updated };
}

// A short-lived signed URL for a drawn-signature image (private bucket).
export async function signatureUrl(admin: Admin, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}
