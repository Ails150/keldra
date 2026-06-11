"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";

type Member = { id: string; name: string; role: string };

// Assign people to this task. Visible to org_admin / manager / superadmin only.
export default function TaskAssign({ taskCode }: { taskCode: string }) {
  const [canAssign, setCanAssign] = useState<boolean | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/assign?taskCode=${encodeURIComponent(taskCode)}`);
    if (!res.ok) {
      setCanAssign(false);
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { members?: Member[]; assigned?: string[] };
    setMembers(data.members ?? []);
    setAssigned(new Set(data.assigned ?? []));
    setCanAssign(true);
  }, [taskCode]);

  useEffect(() => {
    // Only managers/admins can read this endpoint; a 403 hides the panel.
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setCanAssign(false);
          return;
        }
        void load();
      } catch {
        setCanAssign(false);
      }
    })();
  }, [load]);

  async function toggle(userId: string) {
    const adding = !assigned.has(userId);
    setAssigned((cur) => {
      const next = new Set(cur);
      if (adding) next.add(userId);
      else next.delete(userId);
      return next;
    });
    await fetch("/api/tasks/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskCode, userId, action: adding ? "add" : "remove" }),
    });
  }

  if (!canAssign) return null;

  return (
    <div style={{ border: `0.5px solid ${BRAND.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <p
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: BRAND.inkMuted,
          fontWeight: 600,
        }}
      >
        Assigned to
      </p>
      {members.length === 0 ? (
        <p className="mt-2 text-xs text-ink-mid">No org members to assign.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {members.map((m) => (
            <li key={m.id}>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={assigned.has(m.id)} onChange={() => toggle(m.id)} />
                {m.name}
                <span className="text-[11px] text-ink-mid">· {m.role}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
