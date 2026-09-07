import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionState, isAdminRole } from "@/lib/auth/profile";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy/policy";

// Right-to-erasure endpoint (UK/EU GDPR Art 17).
//
// SCOPE IS THE SECURITY PROPERTY HERE. This is the most powerful delete
// primitive in the product, so it is bound the same way every other route is:
// org admins may only erase a subject **within their own org**, and the org id
// comes from the verified session, never from the request body. A superadmin may
// erase across orgs and must name the org explicitly rather than getting an
// implicit global sweep.
//
// HONESTY IS THE OTHER PROPERTY. Counts on a real run come from the rows the
// database actually returned — never from a count taken beforehand. An erasure
// endpoint that reports removing something it failed to remove is worse than one
// that errors, so any write failure is collected, returned, and makes the request
// fail with a 500 instead of a reassuring summary.
//
// WHAT IS ERASED vs RETAINED — the deliberate part:
//   erased    roster, task_contacts, org_invites, inbound_unmatched,
//             task_notes authorship, task_emails content, profile, auth account
//   retained  blocker_events, asset_tag_events, gate_signoffs
//
// The retained three are append-only and hash-chained: `actor` / `actor_name` are
// inputs to the row hash, and DB guard triggers reject UPDATE and DELETE. Editing
// them would break chain verification — destroying the evidence property Keldra
// exists to provide — and would fail at the database anyway. That retention is
// relied on under Art 17(3)(e) (establishment, exercise or defence of legal
// claims), and every request records what it kept, and why, in erasure_log.
//
// GET  ?email=…                dry run: counts only, changes nothing.
// POST {email, confirm:true}   performs the erasure.

const RETENTION_BASIS =
  "UK/EU GDPR Art 17(3)(e) — append-only, hash-chained commissioning accountability record retained for the establishment, exercise or defence of legal claims";

type Counts = Record<string, number>;
type SweepResult = {
  counts: Counts;
  errors: Record<string, string>;
  skipped: Record<string, string>;
};

// A table that does not exist on this project is not an erasure failure — it
// holds no data about anyone. PostgREST reports that as PGRST205. Anything else
// IS a failure and must be surfaced. (supabase-contacts.sql, which creates
// task_contacts, is not applied on every project.)
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "PGRST205" || /Could not find the table/i.test(err.message ?? "");
}

function hashSubject(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

async function resolve(request: NextRequest) {
  const state = await getSessionState();
  if (state.status !== "ready" || !state.profile.org_id || !isAdminRole(state.profile.role)) {
    return { error: NextResponse.json({ error: "Org admins only." }, { status: 403 }) };
  }
  const isSuper = state.profile.role === "superadmin";

  const url = new URL(request.url);
  let email = url.searchParams.get("email") ?? "";
  let bodyOrgId: string | null = null;
  let confirm = false;

  if (request.method === "POST") {
    try {
      const body = await request.json();
      email = typeof body.email === "string" ? body.email : email;
      confirm = body.confirm === true;
      bodyOrgId = typeof body.org_id === "string" ? body.org_id : null;
    } catch {
      return { error: NextResponse.json({ error: "Invalid request." }, { status: 400 }) };
    }
  }

  email = email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: NextResponse.json({ error: "A valid email is required." }, { status: 400 }) };
  }

  // A non-superadmin's org ALWAYS comes from the session; org_id in the body is
  // ignored outright rather than validated, so there is nothing to get wrong.
  const orgId = isSuper && bodyOrgId ? bodyOrgId : state.profile.org_id;

  return { state, orgId, email, confirm, isSuper };
}

async function sweep(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  email: string,
  dry: boolean,
): Promise<SweepResult> {
  const counts: Counts = {};
  const errors: Record<string, string> = {};
  const skipped: Record<string, string> = {};

  const record = (key: string, err: { code?: string; message?: string } | null) => {
    if (!err) return;
    if (isMissingTable(err)) skipped[key] = "table not present on this project";
    else errors[key] = err.message ?? "unknown error";
  };

  // --- roster ---
  if (dry) {
    const { count, error } = await admin.from("roster")
      .select("*", { count: "exact", head: true }).eq("org_id", orgId).ilike("email", email);
    record("roster", error);
    counts.roster = count ?? 0;
  } else {
    const { data, error } = await admin.from("roster")
      .delete().eq("org_id", orgId).ilike("email", email).select("id");
    record("roster", error);
    counts.roster = data?.length ?? 0;
  }

  // --- task_contacts ---
  if (dry) {
    const { count, error } = await admin.from("task_contacts")
      .select("*", { count: "exact", head: true }).eq("org_id", orgId).ilike("email", email);
    record("task_contacts", error);
    counts.task_contacts = count ?? 0;
  } else {
    const { data, error } = await admin.from("task_contacts")
      .delete().eq("org_id", orgId).ilike("email", email).select("id");
    record("task_contacts", error);
    counts.task_contacts = data?.length ?? 0;
  }

  // --- org_invites (keyed by email) ---
  if (dry) {
    const { count, error } = await admin.from("org_invites")
      .select("*", { count: "exact", head: true }).eq("org_id", orgId).ilike("email", email);
    record("org_invites", error);
    counts.org_invites = count ?? 0;
  } else {
    const { data, error } = await admin.from("org_invites")
      .delete().eq("org_id", orgId).ilike("email", email).select("email");
    record("org_invites", error);
    counts.org_invites = data?.length ?? 0;
  }

  // --- inbound_unmatched (no org_id column; matched on sender alone) ---
  if (dry) {
    const { count, error } = await admin.from("inbound_unmatched")
      .select("*", { count: "exact", head: true }).ilike("from_email", email);
    record("inbound_unmatched", error);
    counts.inbound_unmatched = count ?? 0;
  } else {
    const { data, error } = await admin.from("inbound_unmatched")
      .delete().ilike("from_email", email).select("id");
    record("inbound_unmatched", error);
    counts.inbound_unmatched = data?.length ?? 0;
  }

  // --- task_emails: keep the row, drop the content and the address ---
  {
    const { data, error } = await admin.from("task_emails")
      .select("id, from_email, to_email").eq("org_id", orgId);
    if (error) {
      record("task_emails_redacted", error);
      counts.task_emails_redacted = 0;
    } else {
      const hits = (data ?? []).filter(
        (r) =>
          (r.from_email ?? "").toLowerCase().includes(email) ||
          (r.to_email ?? "").toLowerCase().includes(email),
      );
      if (dry) {
        counts.task_emails_redacted = hits.length;
      } else {
        let done = 0;
        for (const row of hits) {
          const { data: upd, error: upErr } = await admin.from("task_emails")
            .update({
              from_email: (row.from_email ?? "").toLowerCase().includes(email) ? "[erased]" : row.from_email,
              to_email: (row.to_email ?? "").toLowerCase().includes(email) ? "[erased]" : row.to_email,
              body_text: null,
              body_html: null,
              subject: "[erased on data-subject request]",
            })
            .eq("id", row.id)
            .select("id");
          if (upErr) { record("task_emails_redacted", upErr); continue; }
          done += upd?.length ?? 0;
        }
        counts.task_emails_redacted = done;
      }
    }
  }

  // --- the account itself ---
  const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authUser = (authList?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);

  const noAccount = () => {
    counts.task_notes_authorship = 0;
    counts.users_profile = 0;
    counts.auth_account = 0;
    return { counts, errors, skipped };
  };

  if (!authUser) return noAccount();

  // Only if they belong to THIS org — an admin must not reach an account in
  // another tenant just because they happen to know the address.
  const { data: profile } = await admin.from("users")
    .select("id, org_id").eq("id", authUser.id)
    .maybeSingle<{ id: string; org_id: string | null }>();
  if (profile?.org_id !== orgId) return noAccount();

  if (dry) {
    const { count: notes } = await admin.from("task_notes")
      .select("*", { count: "exact", head: true }).eq("org_id", orgId).eq("author_id", authUser.id);
    counts.task_notes_authorship = notes ?? 0;
    counts.users_profile = 1;
    counts.auth_account = 1;
    return { counts, errors, skipped };
  }

  const { data: notes, error: notesErr } = await admin.from("task_notes")
    .update({ author_name: "[erased]" })
    .eq("org_id", orgId).eq("author_id", authUser.id).select("id");
  record("task_notes_authorship", notesErr);
  counts.task_notes_authorship = notes?.length ?? 0;

  const { data: profDel, error: profErr } = await admin.from("users")
    .delete().eq("id", authUser.id).eq("org_id", orgId).select("id");
  record("users_profile", profErr);
  counts.users_profile = profDel?.length ?? 0;

  const { error: authErr } = await admin.auth.admin.deleteUser(authUser.id);
  if (authErr) errors.auth_account = authErr.message;  // auth plane: never "missing table"
  counts.auth_account = authErr ? 0 : 1;

  return { counts, errors, skipped };
}

// What we are keeping, and how much of it — reported on every request so the
// answer to "what did you retain about me?" is never a guess.
async function retainedCounts(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  email: string,
): Promise<Record<string, { rows: number; basis: string }>> {
  const local = email.split("@")[0];
  const out: Record<string, { rows: number; basis: string }> = {};

  const { data: be } = await admin.from("blocker_events").select("actor").eq("org_id", orgId);
  out.blocker_events = {
    rows: (be ?? []).filter((r) => (r.actor ?? "").toLowerCase().includes(local)).length,
    basis: RETENTION_BASIS,
  };

  const { data: ae } = await admin.from("asset_tag_events").select("actor_name").eq("org_id", orgId);
  out.asset_tag_events = {
    rows: (ae ?? []).filter((r) => (r.actor_name ?? "").toLowerCase().includes(local)).length,
    basis: RETENTION_BASIS,
  };

  const { data: gs } = await admin.from("gate_signoffs")
    .select("signed_by_email, signed_by_name").eq("org_id", orgId);
  out.gate_signoffs = {
    rows: (gs ?? []).filter(
      (r) =>
        (r.signed_by_email ?? "").toLowerCase() === email ||
        (r.signed_by_name ?? "").toLowerCase().includes(local),
    ).length,
    basis: RETENTION_BASIS,
  };

  return out;
}

export async function GET(request: NextRequest) {
  const r = await resolve(request);
  if ("error" in r) return r.error;
  const admin = createAdminClient();

  const { counts, errors, skipped } = await sweep(admin, r.orgId, r.email, true);
  const retained = await retainedCounts(admin, r.orgId, r.email);

  return NextResponse.json({
    dry_run: true,
    org_id: r.orgId,
    would_erase: counts,
    would_retain: retained,
    problems: Object.keys(errors).length ? errors : undefined,
    skipped: Object.keys(skipped).length ? skipped : undefined,
    policy_version: PRIVACY_POLICY_VERSION,
    note: "Nothing was changed. POST with { email, confirm: true } to perform the erasure.",
  });
}

export async function POST(request: NextRequest) {
  const r = await resolve(request);
  if ("error" in r) return r.error;
  if (!r.confirm) {
    return NextResponse.json(
      { error: "Refusing to erase without { confirm: true }. GET this endpoint first for a dry run." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const retained = await retainedCounts(admin, r.orgId, r.email);
  const { counts, errors, skipped } = await sweep(admin, r.orgId, r.email, false);

  const { error: logErr } = await admin.from("erasure_log").insert({
    subject_hash: hashSubject(r.email),
    org_id: r.orgId,
    requested_by: r.state.profile.id,
    erased: counts,
    retained,
    policy_version: PRIVACY_POLICY_VERSION,
  });

  // A partial erasure must never read as success. If any table failed, or the
  // log could not be written, say so and return 500 — the caller has a legal
  // obligation riding on this answer.
  const failed = Object.keys(errors).length > 0 || !!logErr;

  return NextResponse.json(
    {
      ok: !failed,
      org_id: r.orgId,
      erased: counts,
      retained,
      problems: Object.keys(errors).length ? errors : undefined,
      skipped: Object.keys(skipped).length ? skipped : undefined,
      log_written: !logErr,
      log_error: logErr?.message ?? null,
      policy_version: PRIVACY_POLICY_VERSION,
      ...(failed
        ? { warning: "Erasure was INCOMPLETE. Do not report this subject as erased until the problems above are resolved and this endpoint returns ok:true." }
        : {}),
    },
    { status: failed ? 500 : 200 },
  );
}
