# Keldra — Asset Tag System (Red / Yellow / Green) + Checklists
## Feature spec from Johnny (commissioning), captured for build

The commissioning team thinks in TAGS per asset, not abstract gates.
Tags are a strict sequence — each depends on the one before.

---

## THE TAG LADDER (strict, sequential — each requires the previous)

**RED tag** — physical equipment is in place, with its checklist approved.
The asset EXISTS and is ready to be worked on. Nothing progresses until red is done.

**YELLOW tag** — the panel can now be worked on: cables installed, panel completed,
tested and ready for power-on. *Cannot get a yellow tag unless the red tag is done.*

**GREEN tag** — operational, now in operations. *Requires yellow first.*

Dependency rule (hard): RED → YELLOW → GREEN. You cannot skip or reorder.

---

## WHAT JOHNNY ASKED KELDRA TO SHOW (his words)

1. ASSET LIST → click an asset → "what do we need to align to get [the next tag]?"
   Each tag needs a CHECKLIST completed/approved. e.g. "is the documentation
   loaded up for testing?"

2. TAG STATUS at a high level / rollup:
   "20 at green, 10 at red because they haven't achieved XYZ."
   Counts per tag state across all assets.

3. FILTER BY DATE:
   - see red-tag dates and yellow-tag dates
   - "can I see which red tags are achieved?"
   - filter the asset list by date / by tag state

4. PREDICTION TIE-IN (uses the intelligence layer):
   "with current pattern and baseline programme, the date is going to be
   delivered by [N] days [late/early]."
   i.e. per-asset / per-tag forecast of completion vs baseline programme.

5. BLOCKER FRAMING:
   "these three yellow tags are blocking them / are you going to achieve
   this yellow tag?" — the things stopping a tag = the blockers (existing
   blocker model links here).

---

## ARCHITECTURE DECISION (agreed)

Tags ADD an asset-level layer; they do NOT replace Gates A–E.
- TAGS = per ASSET (this panel, this CRAC, this board) — maturity of one piece of kit.
- GATES = per PHASE (containment, power, energisation) — rollup of tagged assets.
- A gate clears when its assets reach the required tag. Tags are the granular
  drill-down UNDER the gates; gates are the phase rollup ON TOP.

---

## BUILD SEQUENCE

### TONIGHT (the spine — ONE focused build, must not break the demo):
- Asset list view (Keldra already holds the asset list).
- Click an asset → asset detail showing its current tag (red/yellow/green)
  + the CHECKLIST for the NEXT tag (what's needed to align).
- Seed this in BLAKE only with believable data. Sit it UNDER the gates
  (add, don't replace). Diagnose read-only first, prove in Blake, don't
  touch Ardmac, push when green.

### AFTER WEDNESDAY (the rest — separate builds, not overnight):
- Date filtering (red-tag / yellow-tag dates, "achieved" filter).
- Rollup counts per tag state ("20 green, 10 red").
- The strict dependency engine (yellow locked until red done, etc.).
- Prediction tie-in: per-asset completion forecast vs baseline programme
  ("delivered by N days late") — uses the intelligence layer.
- Blocker linkage: "these 3 yellow tags are blocked by X".

---

## ASSET PANEL — POLISH LIST (from reviewing the live spine, 18 Jun)

The spine works (tag + checklist + owner + days + rollup all live). These
are the gaps to close NEXT — each is a separate, careful build with a Blake
re-seed, NOT to be rushed. Done with a clear head.

1. NAMED OWNERS, not roles. Panel shows "Site Manager / Main Contractor" —
   seed uses role labels. Seed real named people per asset so it reads like
   a real project (and so "who owns it" is a person, not a job title).

2. EMAIL THE OWNER FROM THE PANEL. Add a "chase owner" / email action on the
   asset panel — click → email the owner direct (same pattern as the blocker
   chase). Currently no comms action on an asset.

3. DAYS / DATE DETAIL. Panel shows "40 days in this stage" and the register
   shows the RED date — but want: days-per-tag across the ladder, and
   date filtering ("show me what was red-tagged this week", "which yellows
   are achieved"). This is the date-filtering feature already in the spec.

4. STATUS clarity. The tag IS the status (RED/YELLOW/GREEN) + stage shows RT
   — but confirm with Aileen what "status" she means here (achieved vs
   outstanding? on-track vs late? blocked?) and surface it explicitly if
   it's not the tag itself.

NOTE: all four require a Blake re-seed. After ANY of them, re-verify the
chase trail (ELE-COLO-1030) + gates survived the re-seed — that's broken
twice from re-seeding. Build one at a time, prove in Blake, never Ardmac.
