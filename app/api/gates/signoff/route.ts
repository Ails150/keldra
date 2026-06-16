import { NextResponse, type NextRequest } from "next/server";
import { authedActor } from "@/lib/auth/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { signOffGateItem, canSignOff, loadGateSignoffs, summarise, signatureUrl } from "@/lib/gates/signoff";

// GET → every gate's sign-off breakdown for the org (from the verified session),
// so the gate cards recompute X/Y + cleared and the detail renders the item list.
// Drawn signatures get short-lived signed URLs (private bucket).
export async function GET(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const admin = createAdminClient();
  const byGate = await loadGateSignoffs(admin, actor.orgId);
  const gates: Record<string, unknown> = {};
  for (const [code, items] of byGate) {
    const withUrls = await Promise.all(
      items.map(async (i) => ({ ...i, signature_url: await signatureUrl(admin, i.signature_path) })),
    );
    gates[code] = { summary: summarise(items), items: withUrls };
  }
  return NextResponse.json({ gates, canSignOff: canSignOff(actor.role) });
}

// POST → sign off an outstanding item. Identity comes ONLY from the verified
// session actor — never the request body. Role-gated; refuses re-signing.
export async function POST(request: NextRequest) {
  const actor = await authedActor(request);
  if (!actor) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!canSignOff(actor.role)) return NextResponse.json({ error: "Your role can't sign off gate items." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await signOffGateItem(
    admin,
    { userId: actor.userId, orgId: actor.orgId, role: actor.role, fullName: actor.fullName },
    {
      gateCode: String(body.gateCode ?? ""),
      itemLabel: String(body.itemLabel ?? ""),
      signatureKind: body.signatureKind === "drawn" ? "drawn" : "typed",
      signatureText: body.signatureText == null ? null : String(body.signatureText),
      signatureDataUrl: body.signatureDataUrl == null ? null : String(body.signatureDataUrl),
    },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, signoff: result.signoff });
}
