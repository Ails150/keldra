"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { clearBaseline } from "../lib/baseline-seed";
import { analyzeFile, runIngest, type IngestResult } from "@/lib/ingest/pipeline";
import { TYPE_LABEL, type DetectedType } from "@/lib/ingest/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Item = {
  id: string;
  file: File;
  type: DetectedType;
  status: "detecting" | "ready" | "unknown";
  hint: string;
};

const TYPE_OPTIONS: { value: DetectedType; label: string }[] = [
  { value: "p6_csv", label: "P6 schedule" },
  { value: "sub_returns", label: "Sub manpower returns" },
  { value: "blocker_register", label: "Blocker / constraint register" },
  { value: "procore_daily", label: "Procore daily log" },
  { value: "unknown", label: "Other" },
];

function extBadge(name: string): string {
  return (name.split(".").pop() ?? "?").toUpperCase().slice(0, 4);
}

export default function IngestPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<string, "idle" | "active" | "done">>({});
  const [result, setResult] = useState<IngestResult | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);

  const hasFiles = items.length > 0;
  const readyCount = items.filter((i) => i.status === "ready").length;

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const fresh: Item[] = Array.from(list).map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      type: "unknown",
      status: "detecting",
      hint: "",
    }));
    setItems((prev) => [...prev, ...fresh]);
    for (const it of fresh) {
      const { detection } = await analyzeFile(it.file);
      setItems((prev) =>
        prev.map((p) =>
          p.id === it.id
            ? {
                ...p,
                type: detection.detected_type,
                hint: TYPE_LABEL[detection.detected_type],
                status: detection.detected_type === "unknown" ? "unknown" : "ready",
              }
            : p,
        ),
      );
    }
  }

  function setType(id: string, type: DetectedType) {
    setItems((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              type,
              hint: TYPE_LABEL[type],
              status: type === "unknown" ? "unknown" : "ready",
            }
          : p,
      ),
    );
  }

  const STEPS = [
    "Parsing files",
    "Extracting baseline tasks",
    "Detecting critical rooms",
    "Matching companies",
    "Importing sub returns",
    "Importing blockers",
    "Computing trajectory",
    "Refreshing director board",
  ];

  function stepCount(step: string, r: IngestResult): string {
    switch (step) {
      case "Parsing files": return `${r.stats.files_processed} found`;
      case "Extracting baseline tasks": return `${r.stats.baseline_tasks} found`;
      case "Detecting critical rooms": return `${r.stats.critical_rooms} rooms`;
      case "Matching companies": return `${r.stats.companies_added} new`;
      case "Importing sub returns": return `${r.stats.site_diary_entries} lines`;
      case "Importing blockers": return `${r.stats.blockers} blockers`;
      default: return "";
    }
  }

  async function run() {
    const ready = items.filter((i) => i.status === "ready");
    if (ready.length === 0) return;
    setRunning(true);
    setResult(null);
    setSteps(Object.fromEntries(STEPS.map((s) => [s, "idle"])));

    const res = await runIngest(ready.map((i) => ({ file: i.file, type: i.type })));

    for (const s of STEPS) {
      setSteps((p) => ({ ...p, [s]: "active" }));
      await new Promise((r) => setTimeout(r, 170));
      setSteps((p) => ({ ...p, [s]: "done" }));
    }
    setResult(res);
  }

  return (
    <main className="mx-auto max-w-[720px] px-6 py-12">
      <h1
        className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
        style={{ fontSize: 28, lineHeight: 1.1 }}
      >
        Live ingest
      </h1>
      <p
        className="mt-1 font-[family-name:var(--font-fraunces)] italic text-ink-mid"
        style={{ fontSize: 14 }}
      >
        Drop your project files. Keldra reads them. Director board updates in
        seconds.
      </p>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
        className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl text-center"
        style={{
          border: `1.5px ${dragOver ? "solid" : "dashed"} ${dragOver ? BRAND.purple : BRAND.border}`,
          padding: hasFiles ? "20px" : "56px 32px",
          background: `${BRAND.cream}80`,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xer,.xlsx,.xls,.csv,.pdf"
          className="sr-only"
          onChange={(e) => void addFiles(e.target.files)}
        />
        <UploadIcon />
        {!hasFiles && (
          <>
            <p
              className="mt-3 font-[family-name:var(--font-fraunces)] text-ink"
              style={{ fontSize: 18 }}
            >
              Drop files here
            </p>
            <p className="text-[13px] text-ink-mid">or click to browse</p>
            <p className="mt-2 font-mono text-[11px] text-ink-mid">
              Supported: .xer .xlsx .xls .csv .pdf · multiple files OK
            </p>
          </>
        )}
        {hasFiles && (
          <p className="text-[13px] text-ink-mid">Drop more, or click to browse</p>
        )}
      </div>

      {/* Detected files */}
      {hasFiles && (
        <ul className="mt-4 space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-xl border border-paper-line bg-paper-card px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="rounded-[3px] px-1.5 py-0.5 font-mono text-[10px]"
                  style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}
                >
                  {extBadge(it.file.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">{it.file.name}</p>
                  <p className="text-[11px] italic text-ink-mid">{it.hint || "…"}</p>
                </div>
                <StatusPill status={it.status} />
                <button
                  type="button"
                  onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}
                  className="text-ink-mid hover:text-ink"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
              {it.status === "unknown" && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-ink-mid">
                    Tell Keldra what this is:
                  </span>
                  <select
                    value={it.type}
                    onChange={(e) => setType(it.id, e.target.value as DetectedType)}
                    className="rounded-lg border border-border-soft bg-paper-card px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Project selector */}
      {hasFiles && (
        <div className="mt-5">
          <label className="flex items-center gap-2 text-sm text-ink">
            Replace data for project:
            <select
              defaultValue="MER"
              className="rounded-lg border border-border-soft bg-paper-card px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
            >
              <option>MER</option>
            </select>
          </label>
          <p className="mt-1 text-[11px] text-ink-mid">
            Existing project data will be deleted and replaced with what&apos;s in
            these files. This cannot be undone.
          </p>
        </div>
      )}

      {/* Run */}
      <button
        type="button"
        disabled={readyCount === 0}
        onClick={() => void run()}
        className="mt-6 w-full rounded-xl py-3 text-sm font-semibold text-paper transition-opacity disabled:opacity-40"
        style={{ backgroundColor: BRAND.purple }}
      >
        Run ingest{readyCount > 0 ? ` (${readyCount} ready)` : ""}
      </button>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => {
            if (confirm("Reset to the last-known May 27 seed?")) {
              clearBaseline();
              router.push("/dashboard");
            }
          }}
          className="text-[11px] text-ink-mid underline hover:text-ink"
        >
          Or reset to last-known state (May 27 seed)
        </button>
      </div>

      {/* Progress modal */}
      {running && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6">
          <div className="w-full max-w-[600px] rounded-2xl bg-paper-card p-6">
            {!result ? (
              <>
                <h2
                  className="font-[family-name:var(--font-fraunces)] font-semibold text-ink"
                  style={{ fontSize: 22 }}
                >
                  Ingesting your project
                </h2>
                <p className="mt-1 text-[13px] italic text-ink-mid">
                  This usually takes 10–30 seconds.
                </p>
                <ul className="mt-4 space-y-2">
                  {STEPS.map((s) => (
                    <li key={s} className="flex items-center gap-3 text-sm">
                      <StepIcon state={steps[s] ?? "idle"} />
                      <span
                        className={steps[s] === "done" ? "text-ink" : "text-ink-mid"}
                      >
                        {s}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="text-center">
                <p
                  className="font-[family-name:var(--font-fraunces)] font-semibold"
                  style={{ fontSize: 24, color: BRAND.successInk }}
                >
                  Ingest complete
                </p>
                <p className="mt-2 text-[13px] text-ink-mid">
                  {result.stats.baseline_tasks} tasks · {result.stats.critical_rooms}{" "}
                  critical rooms · {result.stats.companies_added} new companies ·{" "}
                  {result.stats.blockers} blockers · {result.stats.site_diary_entries}{" "}
                  diary lines
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard")}
                  className="mt-5 w-full rounded-xl py-3 text-sm font-semibold text-paper"
                  style={{ backgroundColor: BRAND.purple }}
                >
                  View director board →
                </button>
                {result.stats.warnings.length > 0 && (
                  <div className="mt-3 text-left">
                    <button
                      type="button"
                      onClick={() => setShowWarnings((v) => !v)}
                      className="text-[11px] font-medium text-accent hover:text-accent-deep"
                    >
                      Review warnings ({result.stats.warnings.length})
                    </button>
                    {showWarnings && (
                      <ul className="mt-2 space-y-1">
                        {result.stats.warnings.map((w, i) => (
                          <li
                            key={i}
                            className="text-[11px] italic"
                            style={{ color: BRAND.warningInk }}
                          >
                            {w}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function StatusPill({ status }: { status: Item["status"] }) {
  const map = {
    ready: { bg: BRAND.successBg, ink: BRAND.successInk, label: "Ready" },
    detecting: { bg: BRAND.warningBg, ink: BRAND.warningInk, label: "Detecting" },
    unknown: { bg: BRAND.dangerBg, ink: BRAND.dangerInk, label: "Unknown — pick type" },
  }[status];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: map.bg, color: map.ink }}
    >
      {map.label}
    </span>
  );
}

function StepIcon({ state }: { state: "idle" | "active" | "done" }) {
  if (state === "done")
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-paper"
        style={{ backgroundColor: BRAND.successInk }}
      >
        ✓
      </span>
    );
  if (state === "active")
    return (
      <span
        className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-paper-line"
        style={{ borderTopColor: BRAND.purple }}
      />
    );
  return <span className="inline-block h-5 w-5 rounded-full border border-paper-line" />;
}

function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={BRAND.purple} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
