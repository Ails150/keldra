"use client";

import { useEffect } from "react";

// The app previously registered a caching service worker, which could serve a
// stale build on mobile (it's a PWA). We now NEVER register a caching SW; on
// every load we actively unregister any existing service worker and clear its
// caches, so a real device always pulls the latest build from the network.
export default function SwRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        regs.forEach((r) => r.unregister().catch(() => {}));
      })
      .catch(() => {});
    if (typeof caches !== "undefined") {
      caches
        .keys()
        .then((keys) => keys.forEach((k) => caches.delete(k).catch(() => {})))
        .catch(() => {});
    }
  }, []);

  return null;
}
