import { NextResponse, type NextRequest } from "next/server";
import { getSessionState } from "@/lib/auth/profile";
import { sendTaskEmail } from "@/lib/email/task-email";

// "Email update" trigger from the task panel: an org user sends a status
// request to any email address. The reply-to is threaded back to this task.
export async function POST(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id) {
    return NextResponse.json(
      { error: "You need to be signed in to your organisation to send email." },
      { status: 403 },
    );
  }

  let body: { taskCode?: string; to?: string; subject?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const taskCode = (body.taskCode ?? "").trim();
  const to = (body.to ?? "").trim();
  const message = (body.message ?? "").trim();
  const subject = (body.subject ?? "").trim() || "Status update requested";

  if (!taskCode) {
    return NextResponse.json({ error: "Missing task code." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
  }

  const senderName = state.profile.full_name || state.email;
  const html = renderHtml({
    taskCode,
    message,
    senderName,
    orgName: state.profile.org_name ?? "Keldra",
  });

  try {
    const result = await sendTaskEmail({
      orgId: state.profile.org_id,
      taskCode,
      to,
      subject,
      html,
      text: message || "Could you give us a quick status update on this item?",
      actorUserId: state.profile.id,
    });
    return NextResponse.json({ ok: true, emailId: result.emailId });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Couldn't send the email." },
      { status: 502 },
    );
  }
}

function renderHtml(opts: {
  taskCode: string;
  message: string;
  senderName: string;
  orgName: string;
}): string {
  const body = opts.message
    ? opts.message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")
    : "Could you give us a quick status update on this item?";
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a0f2b;line-height:1.5;">
    <p style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7a5cad;margin:0 0 8px;">
      ${opts.orgName} · ${opts.taskCode}
    </p>
    <p style="margin:0 0 16px;">${body}</p>
    <p style="margin:0 0 4px;">— ${opts.senderName}</p>
    <hr style="border:none;border-top:1px solid #eadff5;margin:20px 0;">
    <p style="font-size:12px;color:#8a7da0;margin:0;">
      Reply directly to this email and your message will appear on the task in Keldra.
    </p>
  </div>`;
}
