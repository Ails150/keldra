import { NextResponse, type NextRequest } from "next/server";
import { authedActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadGateSignoffs, summarise, signatureUrl } from "@/lib/gates/signoff";

// Per-gate formal sign-off record (the dispute artifact). Authed, org-scoped.
// HTML + window.print() — same technique as the task-trail export.
export async function GET(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const gateCode = (new URL(request.url).searchParams.get("gateCode") ?? "").trim();
  if (!gateCode) return NextResponse.json({ error: "Missing gateCode." }, { status: 400 });

  const admin = createAdminClient();
  const { data: gate } = await admin
    .from("gates")
    .select("code, name, target_date")
    .eq("org_id", actor.orgId)
    .eq("code", gateCode)
    .maybeSingle<{ code: string; name: string | null; target_date: string | null }>();

  const byGate = await loadGateSignoffs(admin, actor.orgId);
  const items = byGate.get(gateCode) ?? [];
  const sum = summarise(items);
  const rowsWithUrl = await Promise.all(
    items.map(async (i) => ({ ...i, url: await signatureUrl(admin, i.signature_path) })),
  );

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const fmt = (ts: string | null) => (ts ? new Date(ts).toLocaleString("en-GB") : "");
  const rows = rowsWithUrl
    .map((i) => {
      const sig =
        i.status !== "signed"
          ? "<em style='color:#9b8bb4'>outstanding</em>"
          : i.signature_kind === "drawn" && i.url
            ? `<img src="${i.url}" alt="signature" style="height:40px;background:#fff;border:0.5px solid #e8dcf0;border-radius:4px"/>`
            : `<span style="font-family:Georgia,serif;font-style:italic;font-size:16px;color:#5b2da6">${esc(i.signature_text ?? "")}</span>`;
      return `<tr>
        <td>${esc(i.item_label)}</td>
        <td style="white-space:nowrap;font-weight:600;color:${i.status === "signed" ? "#1f7a3d" : "#9b8bb4"}">${i.status === "signed" ? "Signed off" : "Outstanding"}</td>
        <td>${esc(i.signed_by_name ?? "—")}${i.signed_by_role ? ` <span style="color:#5a4a72">· ${esc(i.signed_by_role)}</span>` : ""}</td>
        <td style="white-space:nowrap;font-family:monospace;font-size:11px;color:#5a4a72">${fmt(i.signed_at)}</td>
        <td>${sig}</td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Gate ${esc(gateCode)} — sign-off record</title>
  <style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a0f2b;margin:32px;}
  h1{font-size:22px;margin-bottom:2px;} table{width:100%;border-collapse:collapse;margin-top:16px;}
  td,th{border-bottom:0.5px solid #e8dcf0;padding:9px 10px;vertical-align:middle;font-size:13px;text-align:left;}
  th{font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#5a4a72;}
  .meta{color:#5a4a72;font-size:12px;}</style></head>
  <body onload="window.print()">
    <h1>Gate ${esc(gateCode)}${gate?.name ? ` — ${esc(gate.name)}` : ""}</h1>
    <p class="meta">Commissioning sign-off record · ${sum.signed} / ${sum.total} signed off${sum.cleared ? " · CLEARED" : ""}${gate?.target_date ? ` · target ${gate.target_date}` : ""}</p>
    <table>
      <thead><tr><th>Item</th><th>Status</th><th>Signed off by</th><th>When</th><th>Signature</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5"><em style="color:#9b8bb4">No commissioning items recorded.</em></td></tr>`}</tbody>
    </table>
  </body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
