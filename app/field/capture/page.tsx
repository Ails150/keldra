"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useField } from "../use-field";
import { createCapturedBlocker } from "../../dashboard/lib/blocker-state";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX_SECONDS = 90;

// Downscale a photo to a modest JPEG data URL so it fits in localStorage.
async function fileToDataUrl(file: File, max = 900): Promise<string> {
  const raw = await new Promise<string>((res, rej) => {
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
      im.src = raw;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return raw;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(new Error("read failed"));
    fr.readAsDataURL(blob);
  });
}

export default function FieldCapture() {
  const { project, blockerMap, persist, name, assets } = useField();

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [assetId, setAssetId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [recError, setRecError] = useState<string | null>(null);
  const [voiceData, setVoiceData] = useState<string | null>(null);
  const [voiceDuration, setVoiceDuration] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const photoFileRef = useRef<File | null>(null);

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    setRecording(false);
  }

  // Auto-stop at the 90s cap.
  useEffect(() => {
    if (recording && seconds >= MAX_SECONDS) stopRecording();
  }, [recording, seconds]);

  // Release the mic + timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startRecording() {
    setRecError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setVoiceDuration(secondsRef.current);
        blobToDataUrl(blob)
          .then(setVoiceData)
          .catch(() => setVoiceData(null));
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setSeconds(0);
      secondsRef.current = 0;
      timerRef.current = setInterval(
        () =>
          setSeconds((s) => {
            secondsRef.current = s + 1;
            return s + 1;
          }),
        1000,
      );
    } catch {
      setRecError("Microphone unavailable or permission denied.");
    }
  }

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
    const base = blockerMap ?? {};
    const description =
      text.trim() || `Field capture${assetId ? ` on ${assetId}` : ""}`;
    const photoDataUrl = photoFileRef.current
      ? await fileToDataUrl(photoFileRef.current).catch(() => null)
      : null;
    const { map, id } = await createCapturedBlocker(base, {
      actor: name && name !== "there" ? name : "Field user",
      description,
      assetId: assetId || undefined,
      caption: text.trim() || undefined,
      photoDataUrl,
      voiceDataUrl: voiceData,
      voiceDuration: voiceData ? voiceDuration : undefined,
    });
    persist(map);
    setSubmitting(false);
    setDoneId(id);
  }

  if (project === null) {
    return (
      <p className="pt-10 text-center text-sm text-ink-mid">
        No project set up yet.
      </p>
    );
  }

  if (doneId) {
    return (
      <div className="space-y-5 pt-6 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
          ✓
        </div>
        <h1
          className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
          style={{ fontSize: 26, lineHeight: 1.1 }}
        >
          Sent to Keldra
        </h1>
        <p className="text-sm text-ink-mid">
          Logged as <span className="font-mono text-ink">{doneId}</span> and
          hash-chained into the audit trail. It&apos;s on the dashboard now.
        </p>
        <div className="space-y-3 pt-2">
          <Link
            href="/field/blockers"
            className="flex min-h-[48px] items-center justify-center rounded-xl bg-accent-deep text-sm font-semibold text-paper active:bg-accent"
          >
            View my blockers
          </Link>
          <button
            type="button"
            onClick={() => {
              setDoneId(null);
              setText("");
              setAssetId("");
              setAudioUrl(null);
              setPhotoUrl(null);
              setSeconds(0);
              setVoiceData(null);
              setVoiceDuration(0);
              photoFileRef.current = null;
            }}
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
      <h1
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 26, lineHeight: 1.1 }}
      >
        Capture
      </h1>

      {/* Voice note */}
      <div className="rounded-2xl border border-paper-line bg-paper-card p-4">
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          className={`flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl text-base font-semibold transition-colors ${
            recording
              ? "bg-red-600 text-white"
              : "border-2 border-accent-deep text-accent-deep active:bg-accent/10"
          }`}
        >
          <span aria-hidden>{recording ? "■" : "●"}</span>
          {recording
            ? `Recording… ${seconds}s (tap to stop)`
            : "Voice note"}
        </button>
        {recError && <p className="mt-2 text-xs text-red-600">{recError}</p>}
        {audioUrl && !recording && (
          <audio controls src={audioUrl} className="mt-3 w-full" />
        )}
      </div>

      {/* Photo */}
      <div className="rounded-2xl border border-paper-line bg-paper-card p-4">
        <label className="flex min-h-[56px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-accent-deep text-base font-semibold text-accent-deep active:bg-accent/10">
          <span aria-hidden>◎</span> Take photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={onPhoto}
          />
        </label>
        {photoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photoUrl}
            alt="Captured evidence preview"
            className="mt-3 max-h-64 w-full rounded-xl object-cover"
          />
        )}
      </div>

      {/* Text */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's happening? (optional)"
        rows={3}
        className="w-full rounded-2xl border border-paper-line bg-paper-card p-4 text-base text-ink outline-none focus:border-accent"
      />

      {/* Asset */}
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-mid">
          Which asset?
        </span>
        <select
          value={assetId}
          onChange={(e) => setAssetId(e.target.value)}
          className="mt-2 min-h-[48px] w-full rounded-2xl border border-paper-line bg-paper-card px-4 text-base text-ink outline-none focus:border-accent"
        >
          <option value="">— Select an asset (optional) —</option>
          {assets.map((a: any) => (
            <option key={a.asset_id} value={a.asset_id}>
              {a.asset_id}
              {a.asset_type ? ` — ${a.asset_type}` : ""}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-accent-deep text-base font-semibold text-paper shadow-[0_8px_24px_-8px_rgba(94,37,163,0.6)] active:bg-accent disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send to Keldra"}
      </button>
    </div>
  );
}
