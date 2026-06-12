import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Generate a set-password link for an email and deliver it via Resend (our
// verified reply.keldra.io sender) — works for BOTH new invitees (type=invite,
// creates the user) and existing pending people (type=recovery). This is why
// resend now works: inviteUserByEmail only handles brand-new users.
export async function generateInviteLink(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  redirectTo: string,
): Promise<{ userId: string; link: string }> {
  // New user → invite. If they already exist, fall back to a recovery link.
  let res = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });
  if (res.error) {
    res = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (res.error) throw res.error;
  }
  const link = res.data.properties?.action_link;
  if (!link || !res.data.user) throw new Error("Couldn't generate an invite link.");
  return { userId: res.data.user.id, link };
}

// Send the set-password email via Resend. Returns false if Resend isn't
// configured (caller can still surface that the link was created).
export async function sendInviteEmail(
  to: string,
  link: string,
  orgName: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Keldra <invites@reply.keldra.io>",
      to: [to],
      subject: `Set up your Keldra account for ${orgName}`,
      html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a0f2b;line-height:1.5;">
        <p>You've been invited to <strong>${orgName}</strong> on Keldra.</p>
        <p><a href="${link}" style="color:#8a3dd6;font-weight:600;">Set your password</a> — that's all you need to do.</p>
        <p style="font-size:12px;color:#8a7da0;">Or paste this link: ${link}</p>
      </div>`,
    }),
  });
  return res.ok;
}
