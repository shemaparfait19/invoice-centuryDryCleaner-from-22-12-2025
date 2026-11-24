"use client";

import { useEffect } from "react";

// Registers the service worker that makes the app installable. Browsers
// only allow this on HTTPS (or localhost), so skip elsewhere rather than
// logging noisy errors on a plain LAN address.
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const { protocol, hostname } = window.location;
    const secure =
      protocol === "https:" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1";
    if (!secure) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
