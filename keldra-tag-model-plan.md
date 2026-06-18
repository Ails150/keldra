# Keldra — Tag-centric commissioning model · staged build plan

Plan only. Locked to `keldra-tag-model.html` (the visual target) and
`keldra-tag-model-spec.md` (the feature spec). **Nothing here is built or seeded yet.**
Every stage: prove in Blake, never touch Ardmac (`437ec2d5`), push when green.

The model: assets move **Red → Yellow → Green** (strict, each requires the prior).
Tags are the spine; **gates roll up FROM tags**; each tag transition carries a
who/what/where/when/why/how history, named owner, dates, days-at-tag,
delay-vs-baseline, next-tag checklist, a status (achieved / in-progress / late /
blocked), a forward-look + chase, and a follow-on **cascade up to gate → milestone**.

---

## 0. What exists today (the substrate — do not break)

- **Asset-tag spine (shipped):** `asset_tags(org_id, asset_id, tag, next_checklist jsonb, unique(org_id,asset_id))`, RLS select org-scoped; `GET /api/assets/tag`; "Commissioning tag" section in `AssetDetailPanel`; seeded in Blake (335 rows) from `sample-seed.ts` (`generateAssets` → `tagFromStage` → `assetChecklist`).
- **Assets are synthetic, not DB-backed:** `lib/demo-assets.ts generateAssets()` (~345 rows), served via `useDemo()`, identical across orgs; DB layers overlay **by `asset_id`**. Fields: `asset_id, asset_type, current_stage, owner_name/owner_org (ROLE labels), location, system, red/yellow/green_date, activity_id, burn_per_day`.
- **Gates roll up from blockers + sign-offs, NOT tags:** `dashboard-data.ts` (`gateStats` from blockers' `gate` col) + `gate_signoffs`; `lib/gates/impact.ts computeGateImpacts` already does **gate → milestone** slip.
- **Blockers + chase trail:** `blockers(gate, task_code, linked_assets, …)`, hash-chained `blocker_events` (H2 hardening drafted, **not yet applied**), chase/escalation via `lib/sequences/engine.ts` + `task_emails`. Asset panel already lists linked blockers by `linked_assets`/`asset_id`.
- **Prediction is greenfield** (no per-asset forecast exists).
- **Seed fragility (confirmed twice):** `seedSampleData` clean-replaces by `org_id`; re-seed has broken the chase trail + gates before. Any new table joins the clean-replace **idempotently, as service-role**, compatible with the H2 append-only trigger.

---

## Sequencing decision: **H2 first**

The Foundation (below) reuses the `blocker_events` hash-chain + append-only guard
pattern verbatim. Apply **H2 (`supabase-blocker-events-guard.sql` + the shared
hash lib)** before this so the chain/trigger design is settled once and the asset
chain copies a proven path. If H2 slips, the Foundation can still ship — it just
re-implements the same trigger/seed coexistence independently.

---

## Foundation — the richer tag-transition data model

The current single `asset_tags` row can't hold history/owner/dates/status. Add a
per-asset append-only transition log + extend the current-state row.

**Schema (new migration `supabase-asset-tag-events.sql`):**
- `asset_tag_events(id, org_id, asset_id, seq, from_tag, to_tag, event_type, actor_name, actor_org, payload jsonb, ts, prev_hash, hash, created_at)` — **modelled exactly on `blocker_events`**: append-only, hash-chained. Holds the who/what/where/when/why/how (in `payload`: where, why, how + free text) and the chase/response/achieved events.
- Extend `asset_tags` (ALTER): `owner_name, owner_org, status text check (status in ('achieved','in_progress','late','blocked')), target_date date, achieved_date date, days_at_tag int (derived at read, not stored)`. Keep `tag` + `next_checklist`; extend each checklist item to `{label, status:'approved'|'outstanding', owner}` (per-item owner — the mockup shows "· J. Brennan", "· MEP Sub").
- RLS: select org-scoped + superadmin (copy `asset_tags`/`blocker_events`). Writes via service role only.
- **Append-only guard trigger** on `asset_tag_events` (same as the H2 `blocker_events` guard): block UPDATE for all; block DELETE for `authenticated`/`anon`, allow service-role (so the seed's clean-replace cascade works).

**Code:**
- Reuse the H2 shared `lib/blockers/event-hash.ts` (or a generalised `lib/audit/event-hash.ts`) for `hashAssetTagEvent` + `verifyChain`.
- `lib/assets/tag-events.ts appendAssetTagEvent(admin, {...})` (read last seq+hash → compute → insert), mirroring the blocker append helper.
- Extend `GET /api/assets/tag` to also return the transition history + owner + dates + status (or a sibling `GET /api/assets/tag/history`).

**Extends the spine:** the panel's tag section gains the ladder strip (delivered/days-at/forecast), status pill, per-item-owner checklist, named owner row, and the 6-question history timeline.

**Coexistence:**
- **Seed:** add `asset_tag_events` to the clean-replace as a service-role delete scoped to `org_id`; seed derives transitions from the register's existing `red/yellow/green_date` (achieved dates) + a believable chase trail per stuck asset. Re-verify after: ELE-COLO-1030 chase trail + gates intact.
- **Assets stay synthetic** — DB overlays by `asset_id`; no register change.
- **Gates/blockers untouched** by the Foundation.

---

## Step 1 — Date filter + Red→Yellow / Yellow→Green progression filters
*(spec item 1; mockup: filter chips + "By date ▾" popover)*

- **Schema:** none beyond Foundation (uses `asset_tags.tag/status` + transition dates).
- **Code:** extend the asset list (`AssetsView`) with the chip filters (All / Red→Yellow / Yellow→Green / Delayed-vs-programme) and the date popover ("tag reached between", quick-picks This week / Last 30 days / Overdue only). Client-side filter over the loaded tag rows; "achieved" = `status='achieved'`.
- **Extends spine:** adds filtering over the new `status`/dates.
- **Coexistence:** read-only, client-side; no schema/seed/gate impact.

---

## Step 2 — Rollup counts + **gates roll up FROM tags**
*(spec item 2; mockup: 4 rollup cards + "gates roll up from them")*

- **Schema:** an **asset → gate mapping** (by `system`/phase — e.g. Power→A/B, Cooling→C). Smallest form: a derivation function (no table) `gateForAsset(system, …)`; if it needs to be data-driven, a tiny `gate_asset_map` later. Start with a function.
- **Code:** rollup counts (Green/Yellow/Red/£exposure) from `asset_tags`; compute each gate's **tag-rollup status** (e.g. "9 of N assets below Yellow") in `dashboard-data.ts` as an **added** `DbGate` field, surfaced in the gates view beside the existing sign-off/blocker status.
- **Extends spine:** aggregates the per-asset tags up to phase level.
- **Coexistence (delicate):** **keep `gate_signoffs` + blocker-derived gate status intact** — tag-rollup is an *additional* signal, not a replacement, so the gates view and the "gate clears on sign-offs" behaviour don't regress. £/day exposure stays sourced from the live blocker set (one number across surfaces).

---

## Step 3 — Strict dependency engine (Red→Yellow→Green lock + status)
*(spec item 3; mockup: status pill achieved/in-progress/late/blocked)*

- **Schema:** none beyond Foundation; status lives on `asset_tags`.
- **Code:** an `advance`/`set-status` service-role API that appends an `asset_tag_events` row and updates `asset_tags.tag/status`, enforcing the ladder: cannot reach Yellow unless Red `achieved`, etc.; computes `status` (in_progress / late vs `target_date` / blocked if a linked blocker is open).
- **Extends spine:** turns the static tag into a governed state machine (mirrors the blocker state-machine discipline).
- **Coexistence:** new write path only; reads unaffected; append-only guard already allows the service-role append.

---

## Step 4 — Forecast vs baseline + follow-on cascade (tag → gate → milestone)
*(spec item 4 + the mockup's impact bar and per-asset cascade)*

- **Schema:** none new; reads baseline from the register tag dates / `BASELINE_TASKS` and achieved dates from `asset_tag_events`.
- **Code:** a per-asset forecast ("Yellow tracking +9d late") from achieved-vs-baseline pattern (simple ratio/delta, not ML — same honesty framing as the Horizon cards). Feed the **cascade**: stuck tag → its gate at risk → milestone slip, by extending `lib/gates/impact.ts computeGateImpacts` inputs to include tag-derived gate pressure. Render the cascade bar at **list level** (register-wide) and the **per-asset** cascade in the drawer.
- **Extends spine:** adds the delay/forecast columns + the impact cascade the mockup leads with.
- **Coexistence:** extend the existing impact engine's **inputs**; do not change its current gate/milestone output shape (the gates view depends on it). No seed change.

---

## Step 5 — Blocker linkage + chase/email from the panel
*(spec item 5 + mockup's "Chase MEP Sub" / "Email owner" + 9-of-9 framing)*

- **Schema:** none new — reuse `blockers.linked_assets`/`gate`/`task_code` to associate the blocker(s) stopping a tag.
- **Code:** "these N tags blocked by X" via existing blocker links; a **"chase owner" / "email owner"** action on the asset panel reusing the blocker/sequences email path (`lib/sequences/engine.ts` + `task_emails`) and the named owner from Foundation. Status `blocked` set when a linked blocker is open.
- **Extends spine:** closes the loop from tag → blocker → chase.
- **Coexistence:** **pure reuse** of the existing blocker + chase + email machinery — no new blocker model, no fork of the chase trail.

---

## Field ↔ source dictionary (locks the mockup to data)

| Mockup element | Source |
|---|---|
| Rollup cards (208/34/93) | `count(asset_tags) group by tag`, org-scoped |
| £73k/day exposure | live blocker set (existing single source) |
| List impact cascade | Step 4 (tags → gate → milestone via `impact.ts`) |
| Filter chips / By-date | Step 1 over `asset_tags.tag/status` + transition dates |
| Table: Tag / Status / Progressing-to / Days-at-tag / Delay / £/day | `asset_tags` (tag, status, next_checklist count) + Foundation dates + Step 4 delay + blocker burn |
| Drawer ladder + strip (delivered / days-at / forecast) | Foundation dates + Step 4 forecast |
| Status pill (achieved/in-progress/late/blocked) | `asset_tags.status` (Step 3) |
| Checklist w/ per-item owner | `asset_tags.next_checklist[].{label,status,owner}` (Foundation) |
| Forward look + Chase/Email | Step 5 (reuse chase/email) |
| Per-asset follow-on cascade | Step 4 |
| Owner row (named, "since") | `asset_tags.owner_name/owner_org` (Foundation; needs named-people seed — polish #1) |
| 6-question history timeline | `asset_tag_events` (Foundation) |

---

## Cross-cutting coexistence & risks
- **Seed safety:** every new table (`asset_tag_events`, any map) joins `seedSampleData`'s clean-replace as a service-role delete scoped to `org_id`, idempotent. After **every** stage's re-seed, re-verify ELE-COLO-1030's chase trail **and** the gates survived (the two things broken before).
- **Append-only guard ↔ seed:** the `asset_tag_events` guard blocks client UPDATE/DELETE but allows service-role cascade delete, so re-seed works (the H2 pattern).
- **Gates never regress:** tag-rollup is added beside sign-off/blocker status; gates still clear on sign-offs.
- **Named owners (polish #1):** Foundation introduces `owner_name`; seeding real people per asset is a prerequisite for the mockup's owner row — bundle it into the Foundation seed.
- **Synthetic register:** unchanged; all DB layers overlay by `asset_id`, org-scoped.
- **Ardmac (`437ec2d5`):** never seeded/touched; every stage's proof asserts Ardmac rows = 0.

## Open questions for Aileen / Johnny
1. **Status semantics** (spec polish #4): confirm achieved / in-progress / late / blocked are the four, and the exact rule for "late" (vs `target_date`) and "blocked" (any open linked blocker?).
2. **Asset → gate mapping:** by `system` only, or system + zone? (Drives Step 2.)
3. **Baseline source for forecast:** register tag dates vs `BASELINE_TASKS` programme dates (Step 4).
4. **Are assets staying synthetic**, or is a real DB `assets` table on the roadmap? (Affects whether Foundation should also persist asset identity.)

## Suggested build order
H2 (apply) → Foundation → Step 1 → Step 2 → Step 3 → Step 4 → Step 5. One stage per build, each with a Blake re-seed + proof, never overnight, never Ardmac.
