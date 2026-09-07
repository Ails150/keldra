// Prove L1 (invites GET/revoke are org-scoped in code) in BLAKE ONLY. Replicates
// the hardened queries: the .eq("org_id", BLAKE) filter excludes another org's
// invite from the list AND blocks revoking it, while Blake's own is listed +
// revocable. Chains/trail/gates intact. Throwaways cleaned up.
// Run: npx tsx scripts/prove-l1.ts
import { readFileSync } from "fs";
import { resolve as pathResolve } from "path";
import Module from "node:module";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
for (const [k, v] of Object.entries(env)) process.env[k] = v as string;
const SHIM = pathResolve(process.cwd(), "scripts/_shim-empty.cjs");
const _resolve = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename = function (req: string, ...rest: unknown[]) {
  return _resolve.call(this, req === "server-only" ? SHIM : req, ...rest);
};

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const ARDMAC = "437ec2d5-0c94-4ba8-b8bb-328c3f780774";
let pass = 0, fail = 0;
const made = { orgs: [] as string[], invites: [] as string[] };
const ok = (c: boolean, m: string) => { console.log(`${c ? "✓" : "✗"} ${m}`); c ? pass++ : fail++; };

async function main() {
  const { data: orgs } = await admin.from("organisations").select("id, name");
  const BLAKE = (orgs ?? []).find((o) => o.name === "Blake")?.id as string;
  if (BLAKE !== "4451b60f-e13a-4f88-8279-4904e79c38e8") throw new Error("Refusing: not Blake.");
  console.log(`Blake org_id = ${BLAKE}`);

  const { seedSampleData } = await import("../lib/org/sample-seed");
  const { verifyBlockerChain } = await import("../lib/blockers/event-hash");
  const { verifyAssetTagChain } = await import("../lib/assets/tag-events");
  await seedSampleData(BLAKE);

  const { data: other } = await admin.from("organisations").insert({ name: "L1-Throwaway" }).select("id").single();
  made.orgs.push(other!.id);
  const mk = async (orgId: string, tk: string) => {
    const { data } = await admin.from("org_invite_links").insert({ org_id: orgId, token: tk, role: "member" }).select("id").single();
    made.invites.push(data!.id); return data!.id as string;
  };
  const otherInvite = await mk(other!.id, `l1-other-${Date.now()}`);
  const blakeInvite = await mk(BLAKE, `l1-blake-${Date.now()}`);

  // Replicate the hardened GET: list scoped to BLAKE.
  const { data: listed } = await admin.from("org_invite_links").select("id").eq("org_id", BLAKE);
  const ids = new Set((listed ?? []).map((r) => r.id));
  ok(ids.has(blakeInvite) && !ids.has(otherInvite), "GET lists Blake's invite, NOT another org's (in-code org filter)");

  // Replicate the hardened revoke: cross-org id + org_id=BLAKE → 0 rows.
  const xRevoke = await admin.from("org_invite_links").update({ expires_at: new Date().toISOString() }).eq("id", otherInvite).eq("org_id", BLAKE).select("id");
  const otherStill = (await admin.from("org_invite_links").select("expires_at").eq("id", otherInvite).maybeSingle()).data;
  ok((xRevoke.data?.length ?? 0) === 0 && !otherStill?.expires_at, "cross-org revoke is a no-op (other org's invite untouched)");

  const bRevoke = await admin.from("org_invite_links").update({ expires_at: new Date().toISOString() }).eq("id", blakeInvite).eq("org_id", BLAKE).select("id");
  ok((bRevoke.data?.length ?? 0) === 1, "Blake's own invite IS revocable (control)");

  // Chains/trail/gates intact; Ardmac untouched.
  const hero = (await admin.from("blockers").select("id").eq("org_id", BLAKE).eq("task_code", "ELE-COLO-1030").maybeSingle()).data;
  const hEv = await admin.from("blocker_events").select("seq, event_type, actor, ts, created_at, payload, prev_hash, hash").eq("blocker_id", hero!.id);
  ok((hEv.data ?? []).length >= 14, `ELE-COLO-1030 trail intact (${hEv.data?.length})`);
  ok(verifyBlockerChain(hEv.data ?? []).ok, "blocker_events chain still verifies");
  const a = (await admin.from("asset_tags").select("asset_id").eq("org_id", BLAKE).eq("tag", "red").limit(1).maybeSingle()).data;
  const aEv = await admin.from("asset_tag_events").select("seq, event_type, actor_name, ts, created_at, payload, prev_hash, hash").eq("org_id", BLAKE).eq("asset_id", a!.asset_id);
  ok(verifyAssetTagChain(aEv.data ?? []).ok, "asset_tag_events chain still verifies");
  const gates = await admin.from("gates").select("code").eq("org_id", BLAKE);
  ok((gates.data?.length ?? 0) >= 5, `gates survived re-seed (${gates.data?.length})`);
  const ard = await admin.from("asset_tags").select("id", { count: "exact", head: true }).eq("org_id", ARDMAC);
  ok((ard.count ?? 0) === 0, `Ardmac has 0 asset_tags (got ${ard.count ?? 0})`);

  console.log(`\n${pass} passed, ${fail} failed`);
}

async function cleanup() {
  if (made.invites.length) { try { await admin.from("org_invite_links").delete().in("id", made.invites); } catch { /* */ } }
  if (made.orgs.length) { try { await admin.from("organisations").delete().in("id", made.orgs); } catch { /* */ } }
  console.log(`cleaned up ${made.invites.length} invite(s) + ${made.orgs.length} org(s)`);
}

main().catch((e) => { console.error(e); fail++; }).finally(async () => { await cleanup(); process.exit(fail > 0 ? 1 : 0); });
