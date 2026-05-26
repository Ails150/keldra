"use client";

import { useEffect } from "react";

// Registers the service worker once on first client load. Kept as a tiny
// client component so the root layout can stay a server component.
export default function SwRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration can fail in unsupported/insecure contexts — ignore.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
