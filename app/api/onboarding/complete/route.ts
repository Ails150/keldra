import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getSessionState, isAdminRole } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { seedSampleData } from "@/lib/org/sample-seed";

// Onboarding completion for an AUTHENTICATED org admin: create the project +
// task set (from the template) and real, emailed invite links. No invented
// numbers — the dashboard then renders the org's actual rows. The anonymous
// demo wizard never calls this (it stays on localStorage).
export async function POST(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id || !isAdminRole(state.profile.role)) {
    return NextResponse.json({ error: "Org admins only." }, { status: 403 });
  }
  const orgId = state.profile.org_id;
  const orgName = state.profile.org_name ?? "your organisation";

  let body: { projectName?: string; invites?: { email?: string; role?: string }[] };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const admin = createAdminClient();

  // Project name from the wizard, if a default one was created by the template.
  const projectName = (body.projectName ?? "").trim();
  if (projectName) {
    const { data: existing } = await admin
      .from("projects")
      .select("id")
      .eq("org_id", orgId)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (existing) await admin.from("projects").update({ name: projectName }).eq("id", existing.id);
  }

  // Seed the template task set / gates / blockers / roster (idempotent).
  const seeded = await seedSampleData(orgId);

  // Real invite links + emails.
  const origin = new URL(request.url).origin;
  const invites = (body.invites ?? []).filter((i) => i.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.email));
  let invitesSent = 0;
  for (const inv of invites) {
    const role = ["org_admin", "manager", "viewer", "field", "member"].includes(inv.role ?? "")
      ? (inv.role as string)
      : "member";
    const token = randomBytes(18).toString("base64url");
    const { error } = await admin.from("org_invite_links").insert({
      org_id: orgId,
      token,
      role,
      created_by: state.profile.id,
      max_uses: 1,
    });
    if (error) continue;
    const link = `${origin}/join/${token}`;
    if (await emailInvite(inv.email!, orgName, link)) invitesSent++;
  }

  return NextResponse.json({
    ok: true,
    project: projectName || "Sample project",
    tasks: seeded.tasks,
    blockers: seeded.blockers,
    roster: seeded.roster,
    invitesSent,
    invitesCreated: invites.length,
  });
}

// Invites send from the verified reply.keldra.io domain (the only verified
// sender). Best-effort: returns false (link still created) if Resend isn't set.
async function emailInvite(to: string, orgName: string, link: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Keldra <invites@reply.keldra.io>",
        to: [to],
        subject: `You're invited to join ${orgName} on Keldra`,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a0f2b;line-height:1.5;">
          <p>You've been invited to join <strong>${orgName}</strong> on Keldra.</p>
          <p><a href="${link}" style="color:#8a3dd6;">Accept your invite</a> and set up your account.</p>
          <p style="font-size:12px;color:#8a7da0;">Or paste this link: ${link}</p>
        </div>`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
