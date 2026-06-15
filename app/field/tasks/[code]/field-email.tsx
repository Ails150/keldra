"use client";

import { useEffect, useState, type ChangeEvent } from "react";

type Contact = { email: string; name: string | null; company: string | null };

// Phone-simple "Email update" for the field app. Same task email path as the
// desktop: To (free-typed or a saved contact), message, optional photo, Send —
// threads via the task's reply.keldra.io address, lands in the trail as outbound.
export default function FieldEmail({ taskCode }: { taskCode: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const res = await fetch(`/api/tasks/contacts?taskCode=${encodeURIComponent(taskCode)}`);
      if (res.ok) setContacts(((await res.json()) as { contacts?: Contact[] }).contacts ?? []);
    })();
  }, [open, taskCode]);

  function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    setPhoto(e.target.files?.[0] ?? null);
  }

  async function send() {
    setSending(true);
    setError(null);
    const fd = new FormData();
    fd.set("taskCode", taskCode);
    fd.set("to", to);
    fd.set("contactName", name);
    fd.set("message", message);
    if (photo) fd.append("files", photo);
    const res = await fetch("/api/tasks/email", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Couldn't send.");
      return;
    }
    setSent(true);
    setMessage("");
    setPhoto(null);
    setTimeout(() => setSent(false), 2500);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border-2 border-accent-deep text-sm font-semibold text-accent-deep active:bg-accent/10"
      >
        ✉ Email an update
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border border-paper-line bg-paper-card p-4">
      <p className="text-sm font-semibold text-ink">Email an update</p>
      <input
        type="email"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder="To (any email)"
        className="w-full rounded-xl border border-paper-line bg-paper p-3 text-base text-ink outline-none focus:border-accent"
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Their name (optional)"
        className="w-full rounded-xl border border-paper-line bg-paper p-3 text-base text-ink outline-none focus:border-accent"
      />
      {contacts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {contacts.map((c) => (
            <button
              key={c.email}
              type="button"
              onClick={() => {
                setTo(c.email);
                if (c.name) setName(c.name);
              }}
              className="rounded-full border border-paper-line px-2.5 py-1 text-[11px] text-ink active:bg-paper-warm"
            >
              {c.name || c.email}
            </button>
          ))}
        </div>
      )}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        placeholder="Message…"
        className="w-full rounded-xl border border-paper-line bg-paper p-3 text-base text-ink outline-none focus:border-accent"
      />
      <label className="flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-accent-deep text-sm font-semibold text-accent-deep active:bg-accent/10">
        ◎ {photo ? `Photo: ${photo.name}` : "Attach photo"}
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {sent && <p className="text-sm text-emerald-600">Sent · on the trail, reply threads back here.</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-xl border border-paper-line py-2.5 text-sm font-medium text-ink"
        >
          Close
        </button>
        <button
          type="button"
          onClick={send}
          disabled={sending || !to.trim()}
          className="flex-1 rounded-xl bg-accent-deep py-2.5 text-sm font-semibold text-paper disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
