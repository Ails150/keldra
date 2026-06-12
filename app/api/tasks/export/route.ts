import { NextResponse, type NextRequest } from "next/server";
import { authedActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Trail export. INTERNAL NOTES ARE EXCLUDED BY DEFAULT — enforced HERE, server-
// side, by only fetching task_notes when includeInternal === "1". A tampered UI
// can't slip notes into an external export; the data simply isn't gathered.
export async function GET(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const taskCode = (url.searchParams.get("taskCode") ?? "").trim();
  if (!taskCode) return NextResponse.json({ error: "Missing taskCode." }, { status: 400 });
  const includeInternal = url.searchParams.get("includeInternal") === "1";
  const format = url.searchParams.get("format") ?? "html";

  const admin = createAdminClient();
  const [emailsR, fieldR] = await Promise.all([
    admin.from("task_emails").select("direction, from_email, to_email, subject, body_text, created_at").eq("org_id", actor.orgId).eq("task_code", taskCode),
    admin.from("mer_field_events").select("kind, comment, actor, created_at").eq("org_id", actor.orgId).eq("asset_id", taskCode),
  ]);

  type Item = { ts: string; kind: string; internal: boolean; text: string };
  const items: Item[] = [];
  for (const e of emailsR.data ?? []) {
    items.push({ ts: e.created_at, kind: e.direction === "inbound" ? "Email in" : "Email out", internal: false, text: `${e.subject ?? ""} — ${(e.body_text ?? "").slice(0, 500)}` });
  }
  for (const f of fieldR.data ?? []) {
    items.push({ ts: f.created_at, kind: `Field ${f.kind}`, internal: false, text: `${f.actor}: ${f.comment ?? ""}` });
  }

  // Internal notes — gathered ONLY when explicitly opted in (default: excluded).
  let internalIncluded = 0;
  if (includeInternal) {
    const { data: notes } = await admin
      .from("task_notes")
      .select("body, author_name, created_at")
      .eq("org_id", actor.orgId)
      .eq("task_code", taskCode);
    for (const n of notes ?? []) {
      items.push({ ts: n.created_at, kind: "Internal note", internal: true, text: `${n.author_name}: ${n.body}` });
      internalIncluded++;
    }
  }
  items.sort((a, b) => (a.ts < b.ts ? -1 : 1));

  if (format === "json") {
    return NextResponse.json({ taskCode, includeInternal, internalIncluded, items });
  }

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const rows = items
    .map(
      (i) => `<tr${i.internal ? ' style="background:#f6f0fc"' : ""}>
      <td style="white-space:nowrap;color:#5a4a72;font-family:monospace;font-size:11px;">${new Date(i.ts).toLocaleString("en-GB")}</td>
      <td style="white-space:nowrap;font-weight:600;color:${i.internal ? "#8a3dd6" : "#1a0f2b"};">${i.kind}${i.internal ? " · INTERNAL" : ""}</td>
      <td>${esc(i.text)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${taskCode} — trail</title>
  <style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a0f2b;margin:32px;}
  h1{font-size:22px;} table{width:100%;border-collapse:collapse;} td{border-bottom:0.5px solid #e8dcf0;padding:8px 10px;vertical-align:top;font-size:13px;}
  .meta{color:#5a4a72;font-size:12px;margin-bottom:16px;}</style></head>
  <body onload="window.print()">
    <h1>${taskCode} — activity trail</h1>
    <p class="meta">${items.length} entries · ${includeInternal ? `includes ${internalIncluded} internal note(s) — INTERNAL USE ONLY` : "internal notes excluded"}</p>
    <table>${rows}</table>
  </body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
