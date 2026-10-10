// Self-contained bundle for the extension and bookmarklet; running it again toggles the effect off.
import { activate } from "./everything";

declare global {
  interface Window {
    __fractureAnywhere?: () => void;
  }
}

if (window.__fractureAnywhere) {
  window.__fractureAnywhere();
} else {
  window.__fractureAnywhere = activate({
    // Don't write into the host site's localStorage.
    hud: { storageKey: null },
    onExit: () => delete window.__fractureAnywhere,
  });
}
