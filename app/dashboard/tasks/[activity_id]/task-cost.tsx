"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

// Per-task cost-of-delay override (org_admin / manager). Writes tasks.cost_per_day
// → feeds the burn/exposure maths live.
export default function TaskCostEditor({
  taskCode,
  currentCost,
}: {
  taskCode: string;
  currentCost: number;
}) {
  const [canEdit, setCanEdit] = useState<boolean | null>(null);
  const [value, setValue] = useState(currentCost > 0 ? String(currentCost) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setCanEdit(false);
          return;
        }
        const { data } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
        const role = (data?.role as string | null) ?? "";
        setCanEdit(["org_admin", "manager", "superadmin"].includes(role));
      } catch {
        setCanEdit(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/tasks/cost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskCode, costPerDay: value ? Number(value) : 0 }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      // Re-read the dashboard/task figures against the new rate.
      setTimeout(() => window.location.reload(), 400);
    }
  }

  if (!canEdit) return null;

  return (
    <div style={{ border: `0.5px solid ${BRAND.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <p
        style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: BRAND.inkMuted, fontWeight: 600 }}
      >
        Cost of delay
      </p>
      <p className="mt-1 text-[11px] text-ink-mid">
        {currentCost > 0 ? `Currently ${GBP.format(currentCost)}/day` : "No rate set — slip is not free."}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="£/day"
          className="w-full rounded-lg border border-border-soft bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex-shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-paper disabled:opacity-60"
          style={{ backgroundColor: BRAND.purple }}
        >
          {saving ? "Saving…" : saved ? "Saved" : "Set rate"}
        </button>
      </div>
    </div>
  );
}
