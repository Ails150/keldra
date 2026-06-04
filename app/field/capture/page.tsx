"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { loadBaseline } from "../../dashboard/lib/baseline-seed";
import { raiseRedTag } from "@/lib/supabase/mer-field";

const WITH_PARTIES = ["MEP Sub", "Mech Sub", "Design House", "Main Contractor", "Hyperscale Client", "Controls Sub", "Fire Sub", "Sprinkler Sub"];

/* eslint-disable @typescript-eslint/no-explicit-any */

// Downscale a photo to a modest JPEG Blob for upload to Supabase Storage.
async function fileToJpegBlob(file: File, max = 1000): Promise<Blob> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(new Error("read failed"));
    fr.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("decode failed"));
      im.src = dataUrl;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.72));
      if (blob) return blob;
    }
  } catch {
    /* fall through to original file */
  }
  return file;
}

export default function FieldCapture() {
  // The phone logs against a TASK directly — the same tasks the director sees on
  // the dashboard. The entry lands in that task's Activity trail, synopsis and
  // root-cause. Offer the open (blocked / not-started) tasks, costliest first.
  const tasks = useMemo(
    () =>
      loadBaseline()
        .tasks.filter((t) => t.status === "blocked" || t.status === "not_started_should_be")
        .sort((a, z) => z.cost_per_day - a.cost_per_day),
    [],
  );

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [assetId, setAssetId] = useState(tasks[0]?.activity_id ?? "");
  const [withParty, setWithParty] = useState(WITH_PARTIES[0]);
  const [submitting, setSubmitting] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoFileRef = useRef<File | null>(null);

  function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    photoFileRef.current = file;
    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const photoBlob = photoFileRef.current ? await fileToJpegBlob(photoFileRef.current).catch(() => null) : null;
      const { id } = await raiseRedTag({
        assetId,
        comment: text.trim() || null,
        photoBlob,
        withParty,
        gate: "C",
      });
      setDoneId(id);
    } catch (e: any) {
      setError(e?.message || "Submit failed. Check the Supabase setup (bucket + table + policies).");
    } finally {
      setSubmitting(false);
    }
  }

  if (doneId) {
    return (
      <div className="space-y-5 pt-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">✓</div>
        <h1 className="font-[family-name:var(--font-fraunces)] font-semibold text-ink" style={{ fontSize: 26, lineHeight: 1.1 }}>
          Sent to Keldra
        </h1>
        <p className="text-sm text-ink-mid">
          Live on the director dashboard now — no refresh. Logged for MER and hash-chained into the audit trail.
        </p>
        <div className="space-y-3 pt-2">
          <Link href="/field/blockers" className="flex min-h-[48px] items-center justify-center rounded-xl bg-accent-deep text-sm font-semibold text-paper active:bg-accent">
            View my blockers
          </Link>
          <button
            type="button"
            onClick={() => { setDoneId(null); setText(""); setPhotoUrl(null); photoFileRef.current = null; }}
            className="min-h-[48px] w-full rounded-xl border-2 border-paper-line text-sm font-semibold text-ink active:bg-paper-warm"
          >
            Capture another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="font-[family-name:var(--font-fraunces)] font-semibold text-ink" style={{ fontSize: 26, lineHeight: 1.1 }}>
        Raise a red tag
      </h1>
      <p className="text-sm text-ink-mid">Photo + what you found. It lands on the director dashboard live.</p>

      {/* Photo */}
      <div className="rounded-2xl border border-paper-line bg-paper-card p-4">
        <label className="flex min-h-[56px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-accent-deep text-base font-semibold text-accent-deep active:bg-accent/10">
          <span aria-hidden>◎</span> Take photo
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPhoto} />
        </label>
        {photoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={photoUrl} alt="Captured evidence preview" className="mt-3 max-h-64 w-full rounded-xl object-cover" />
        )}
      </div>

      {/* Text */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What did you find? (e.g. leak at CRAH connection)"
        rows={3}
        className="w-full rounded-2xl border border-paper-line bg-paper-card p-4 text-base text-ink outline-none focus:border-accent"
      />

      {/* Task */}
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-mid">Which task?</span>
        <select
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          className="mt-2 min-h-[48px] w-full rounded-2xl border border-paper-line bg-paper-card px-4 text-base text-ink outline-none focus:border-accent"
        >
          {tasks.map((t) => (
            <option key={t.activity_id} value={t.activity_id}>
              {t.activity_id} — {t.name}
            </option>
          ))}
        </select>
      </label>

      {/* Who it's with */}
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-mid">Who&apos;s it with?</span>
        <select
          value={withParty}
          onChange={(e) => setWithParty(e.target.value)}
          className="mt-2 min-h-[48px] w-full rounded-2xl border border-paper-line bg-paper-card px-4 text-base text-ink outline-none focus:border-accent"
        >
          {WITH_PARTIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-red-600 text-base font-semibold text-paper shadow-[0_8px_24px_-8px_rgba(220,38,38,0.6)] active:bg-red-700 disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Submit red tag"}
      </button>
    </div>
  );
}
