import { NextResponse, type NextRequest } from "next/server";
import { getSessionState, canWrite } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { startSequence } from "@/lib/sequences/engine";

// Start a chase sequence on a task. Org members who can write only.
export async function POST(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id || !canWrite(state.profile.role)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  let body: {
    taskCode?: string;
    to?: string;
    deadline?: string;
    escalationContact?: string;
    gateCode?: string;
    gateDate?: string;
    commitmentQuote?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const taskCode = (body.taskCode ?? "").trim();
  const to = (body.to ?? "").trim();
  if (!taskCode) return NextResponse.json({ error: "Missing task code." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
  }
  // Never guess a CC: only use the escalation contact if it's a real address.
  const escalationContact =
    body.escalationContact && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.escalationContact.trim())
      ? body.escalationContact.trim()
      : null;

  try {
    const { id } = await startSequence(createAdminClient(), {
      orgId: state.profile.org_id,
      taskCode,
      to,
      deadline: body.deadline || null,
      escalationContact,
      gateCode: body.gateCode || null,
      gateDate: body.gateDate || null,
      commitmentQuote: body.commitmentQuote || null,
      createdBy: state.profile.id,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
