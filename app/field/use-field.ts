"use client";

import { useEffect, useState } from "react";
import { orgKey, readStoredProject } from "../dashboard/utils";
import {
  type BlockerMap,
  hydrateFromProject,
  readBlockerState,
  writeBlockerState,
} from "../dashboard/lib/blocker-state";
import type { WizardData } from "../onboarding/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

// First name of the person Field mode is acting as — matched from the roster
// against the viewing org, falling back to the first teammate / org name.
export function deriveFieldName(project: WizardData | null): string {
  const team = project?.uploads?.team ?? [];
  const orgName = project?.viewingAs?.orgName ?? "";
  const match = team.find(
    (p: any) => orgKey(p.organisation) === orgKey(orgName),
  );
  const full = (match?.name || team[0]?.name || orgName || "there").toString();
  return full.split(/\s+/)[0] || "there";
}

// Loads the same project + blocker state the dashboard uses (hydrating from the
// project if the blocker store hasn't been created yet), and keeps it in sync
// across tabs via the storage event so phone captures show up live.
export function useField() {
  const [project, setProject] = useState<WizardData | null | undefined>(
    undefined,
  );
  const [blockerMap, setBlockerMap] = useState<BlockerMap | null>(null);

  useEffect(() => {
    const p = readStoredProject();
    setProject(p);
    if (!p) return;

    let cancelled = false;
    const existing = readBlockerState();
    if (existing) {
      setBlockerMap(existing);
    } else {
      (async () => {
        const fresh = await hydrateFromProject(p);
        if (cancelled) return;
        writeBlockerState(fresh);
        setBlockerMap(fresh);
      })();
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "keldra_blocker_state") {
        const next = readBlockerState();
        if (next) setBlockerMap(next);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function persist(map: BlockerMap) {
    writeBlockerState(map);
    setBlockerMap(map);
  }

  return {
    project,
    blockerMap,
    persist,
    name: deriveFieldName(project ?? null),
    assets: project?.uploads?.assets ?? [],
  };
}
