"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";
import type { Activity } from "@/lib/activity";

type Note = { id: string; body: string; author: string; created_at: string; photoUrl: string | null };

function toActivity(n: Note): Activity {
  return {
    id: `note-${n.id}`,
    task_id: "",
    project_id: "mer",
    type: "note",
    direction: "internal",
    channel: "keldra",
    actor: { name: n.author, company_slug: "", role: "Internal" },
    recipient: null,
    subject: null,
    body: n.body,
    attachments: [],
    metadata: { internal: true, ...(n.photoUrl ? { photo_url: n.photoUrl } : {}) },
    created_at: n.created_at,
    created_by: n.author,
  };
}

// Internal notes for a task, as trail Activities + whether the viewer can post.
export function useTaskNotes(taskCode: string) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [canPost, setCanPost] = useState(false);

  const reload = useCallback(async () => {
    if (!taskCode) return;
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase.from("users").select("org_id, role").eq("id", user.id).maybeSingle();
        const role = (prof?.role as string | null) ?? null;
        setCanPost(!!prof?.org_id && role !== "viewer");
      } else {
        setCanPost(false);
      }
      const res = await fetch(`/api/tasks/notes?taskCode=${encodeURIComponent(taskCode)}`);
      if (!res.ok) {
        setActivities([]);
        return;
      }
      const data = (await res.json()) as { notes?: Note[] };
      setActivities((data.notes ?? []).map(toActivity));
    } catch {
      setActivities([]);
    }
  }, [taskCode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { activities, canPost, reload };
}

export function NoteComposer({ taskCode, onPosted }: { taskCode: string; onPosted: () => void }) {
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    setPhoto(e.target.files?.[0] ?? null);
  }

  async function post() {
    if (!body.trim()) return;
    setPosting(true);
    setError(null);
    const fd = new FormData();
    fd.set("taskCode", taskCode);
    fd.set("body", body);
    if (photo) fd.set("photo", photo);
    const res = await fetch("/api/tasks/notes", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setPosting(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't post note.");
      return;
    }
    setBody("");
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
    onPosted();
  }

  return (
    <div style={{ border: `0.5px solid #99f6e4`, backgroundColor: "#f0fdfa", borderRadius: 10, padding: "10px 12px" }}>
      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#0d9488", fontWeight: 700 }}>
        Internal note · your team only
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Note for your team (not emailed, not in exports)…"
        className="mt-1.5 w-full rounded-lg border border-[#99f6e4] bg-white p-2 text-sm text-ink outline-none focus:border-[#0d9488]"
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <label className="cursor-pointer text-[11px] font-medium text-[#0d9488]">
          {photo ? `📎 ${photo.name}` : "📎 Add photo"}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
        </label>
        <button
          type="button"
          onClick={post}
          disabled={posting || !body.trim()}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-60"
          style={{ backgroundColor: "#0d9488" }}
        >
          {posting ? "Posting…" : "Post note"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
