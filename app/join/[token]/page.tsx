import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import JoinForm from "./join-form";

type InviteRow = {
  org_id: string;
  role: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
};

// Validate a token invite server-side (service role — the invites table is
// RLS-locked to org admins, so the anon client couldn't read it). We only ever
// surface the organisation name, never the token internals.
export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let orgName: string | null = null;
  let invalidReason: string | null = null;

  try {
    const admin = createAdminClient();
    const { data: invite } = await admin
      .from("org_invite_links")
      .select("org_id, role, expires_at, max_uses, use_count")
      .eq("token", token)
      .maybeSingle<InviteRow>();

    if (!invite) {
      invalidReason = "This invite link isn't valid.";
    } else if (invite.expires_at && new Date(invite.expires_at) <= new Date()) {
      invalidReason = "This invite link has expired.";
    } else if (invite.max_uses != null && invite.use_count >= invite.max_uses) {
      invalidReason = "This invite link has already been fully used.";
    } else {
      const { data: org } = await admin
        .from("organisations")
        .select("name")
        .eq("id", invite.org_id)
        .maybeSingle<{ name: string }>();
      orgName = org?.name ?? "your organisation";
    }
  } catch {
    invalidReason =
      "We couldn't check this invite right now. Please try again shortly.";
  }

  return (
    <main className="flex flex-1 flex-col bg-paper">
      <div
        className="mx-auto flex w-full flex-1 flex-col"
        style={{ maxWidth: 1600, paddingLeft: 60, paddingRight: 60 }}
      >
        <section className="pt-16 pb-8 md:pt-24 md:pb-12">
          <Link
            href="/"
            className="font-[family-name:var(--font-fraunces)] font-medium text-ink"
            style={{ fontSize: 28, lineHeight: 1 }}
          >
            Keldra<span style={{ color: "var(--accent)" }}>.</span>
          </Link>

          {invalidReason ? (
            <>
              <h1
                className="mt-8 font-[family-name:var(--font-fraunces)] font-medium text-ink"
                style={{ fontSize: 40, lineHeight: 1.05 }}
              >
                Invite unavailable
              </h1>
              <p className="mt-3 text-ink-mid" style={{ fontSize: 16 }}>
                {invalidReason}
              </p>
            </>
          ) : (
            <>
              <p
                className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-deep"
                style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}
              >
                You&apos;ve been invited
              </p>
              <h1
                className="mt-4 font-[family-name:var(--font-fraunces)] font-medium text-ink"
                style={{ fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.01em" }}
              >
                Join {orgName} on Keldra
              </h1>
              <p
                className="mt-3 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
                style={{ fontSize: 16, lineHeight: 1.55, maxWidth: 520 }}
              >
                Set up your account below. You&apos;ll get a confirmation email,
                and once you confirm you&apos;ll land straight in {orgName}.
              </p>
            </>
          )}
        </section>

        {!invalidReason && (
          <section className="flex-1 pb-16">
            <JoinForm token={token} orgName={orgName ?? "your organisation"} />
          </section>
        )}
      </div>
    </main>
  );
}
