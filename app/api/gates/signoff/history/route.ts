import { NextResponse, type NextRequest } from "next/server";
import { authedActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { signatureUrl } from "@/lib/gates/signoff";

// GET → the full history behind ONE commissioning item, from the real trail
// tables (task_emails / task_notes / blocker_events) plus the sign-off record
// itself. Everything is scoped to the verified session's org — an item from
// another org is simply not found. For a SIGNED item we assemble the chronological
// trail (chases, comms, commitments) and end with the sign-off event; for an
// OUTSTANDING item we return what's blocking it (the open blockers on its gate).
export async function GET(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing item id." }, { status: 400 });

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("gate_signoffs")
    .select("id, gate_code, item_label, status, signed_by_name, signed_by_role, signature_kind, signature_text, signature_path, signed_at, task_code")
    .eq("org_id", actor.orgId)
    .eq("id", id)
    .maybeSingle<{
      id: string; gate_code: string; item_label: string; status: string;
      signed_by_name: string | null; signed_by_role: string | null;
      signature_kind: "typed" | "drawn" | null; signature_text: string | null;
      signature_path: string | null; signed_at: string | null; task_code: string | null;
    }>();
  if (!row) return NextResponse.json({ error: "Item not found for this org." }, { status: 404 });

  type Entry = { ts: string; kind: string; text: string };
  const timeline: Entry[] = [];
  type Blocking = { id: string; title: string; state: string; held_by_company: string | null; cost_per_day: number; task_code: string | null };
  let blocking: Blocking[] = [];

  if (row.status === "signed") {
    if (row.task_code) {
      const [emailsR, notesR, blkR] = await Promise.all([
        admin.from("task_emails").select("direction, subject, body_text, created_at").eq("org_id", actor.orgId).eq("task_code", row.task_code),
        admin.from("task_notes").select("body, author_name, created_at").eq("org_id", actor.orgId).eq("task_code", row.task_code).then((r) => r, () => ({ data: [] as { body: string; author_name: string | null; created_at: string }[] })),
        admin.from("blockers").select("id").eq("org_id", actor.orgId).eq("task_code", row.task_code),
      ]);
      for (const e of emailsR.data ?? []) {
        const m = e as { direction: string; subject: string | null; body_text: string | null; created_at: string };
        timeline.push({ ts: m.created_at, kind: m.direction === "inbound" ? "Reply in" : "Chase out", text: `${m.subject ?? ""}${m.body_text ? ` — ${m.body_text}` : ""}` });
      }
      for (const n of notesR.data ?? []) {
        const m = n as { body: string; author_name: string | null; created_at: string };
        timeline.push({ ts: m.created_at, kind: "Internal note", text: `${m.author_name ?? "Team"}: ${m.body}` });
      }
      const blkIds = (blkR.data ?? []).map((b) => (b as { id: string }).id);
      if (blkIds.length) {
        const { data: evs } = await admin.from("blocker_events").select("event_type, actor, ts, created_at, payload").eq("org_id", actor.orgId).in("blocker_id", blkIds);
        for (const ev of evs ?? []) {
          const m = ev as { event_type: string; actor: string | null; ts: string | null; created_at: string | null; payload: Record<string, unknown> | null };
          const note = (m.payload && typeof m.payload.note === "string") ? ` — ${m.payload.note}` : "";
          timeline.push({ ts: m.ts ?? m.created_at ?? "", kind: `Blocker ${m.event_type}`, text: `${m.actor ?? ""}${note}`.trim() || m.event_type });
        }
      }
    }
    timeline.sort((a, b) => (a.ts < b.ts ? -1 : 1));
    // The sign-off event always closes the story.
    if (row.signed_at) {
      timeline.push({
        ts: row.signed_at,
        kind: "Signed off",
        text: `${row.item_label} — signed off by ${row.signed_by_name ?? "—"}${row.signed_by_role ? ` (${row.signed_by_role})` : ""}${row.signature_kind ? ` [${row.signature_kind} signature]` : ""}`,
      });
    }
  } else {
    // The blocker(s) holding THIS item: prefer the specific link (shared
    // task_code); fall back to gate-wide only when the item isn't linked.
    let q = admin
      .from("blockers")
      .select("id, title, description, state, held_by_company, cost_per_day, task_code")
      .eq("org_id", actor.orgId)
      .neq("state", "closed");
    q = row.task_code ? q.eq("task_code", row.task_code) : q.eq("gate", row.gate_code);
    const { data: gblk } = await q;
    blocking = (gblk ?? []).map((b) => {
      const m = b as { id: string; title: string | null; description: string | null; state: string; held_by_company: string | null; cost_per_day: number | null; task_code: string | null };
      return { id: m.id, title: m.description || m.title || m.id, state: m.state, held_by_company: m.held_by_company, cost_per_day: Number(m.cost_per_day ?? 0), task_code: m.task_code };
    });
  }

  return NextResponse.json({
    item: {
      gate_code: row.gate_code,
      item_label: row.item_label,
      status: row.status,
      signed_by_name: row.signed_by_name,
      signed_by_role: row.signed_by_role,
      signature_kind: row.signature_kind,
      signature_text: row.signature_text,
      signature_url: await signatureUrl(admin, row.signature_path),
      signed_at: row.signed_at,
      task_code: row.task_code,
    },
    timeline,
    blocking,
  });
}
