import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";

// Recover from "Failed to fetch dynamically imported module" errors that
// happen when an open tab references content-hashed chunks from a previous
// deploy. Without this, lazy routes throw forever until the user hard
// reloads. We do a one-shot reload (guarded by sessionStorage) so we
// don't loop if the issue is something else.
const RELOAD_FLAG = "chunk-reload-attempted";

const tryRecoverFromStaleChunk = (message: string) => {
  if (!/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  )) {
    return;
  }
  if (sessionStorage.getItem(RELOAD_FLAG)) return;
  sessionStorage.setItem(RELOAD_FLAG, "1");
  window.location.reload();
};

window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem(RELOAD_FLAG)) return;
  sessionStorage.setItem(RELOAD_FLAG, "1");
  window.location.reload();
});

window.addEventListener("error", (event) => {
  tryRecoverFromStaleChunk(event.message ?? "");
});

window.addEventListener("unhandledrejection", (event) => {
  const reason: any = event.reason;
  const message =
    typeof reason === "string"
      ? reason
      : reason?.message ?? String(reason ?? "");
  tryRecoverFromStaleChunk(message);
});

// On a successful load, clear the guard so a future deploy can recover
// the same way.
window.addEventListener("load", () => {
  sessionStorage.removeItem(RELOAD_FLAG);
});

createRoot(document.getElementById("root")!).render(
  <App />
);