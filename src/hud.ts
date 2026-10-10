import { overlayAttribute } from "./surface.js";

export const destroyedCountKey = "fracture.destroyed-elements";

export interface HudOptions {
  /** Text shown once pieces settle. */
  message?: (count: number) => string;
  /** localStorage key for the running total, or `null` to count only this session. */
  storageKey?: string | null;
}

export const defaultHudMessage = (count: number) =>
  `Fractured ${count.toLocaleString()} ${count === 1 ? "element" : "elements"}.`;

/** Show the persistent fracture total after the session's shards have settled. */
export function createHud({
  message = defaultHudMessage,
  storageKey = destroyedCountKey,
}: HudOptions = {}) {
  const readCount = (fallback = 0): number => {
    if (storageKey === null) return fallback;
    try {
      const count = Number(window.localStorage.getItem(storageKey));
      return Number.isSafeInteger(count) && count >= 0 ? count : 0;
    } catch {
      return fallback;
    }
  };
  let destroyed = readCount();
  let hasFractured = false;
  let visible = false;
  const hud = document.createElement("aside");
  hud.setAttribute(overlayAttribute, "");
  hud.setAttribute("data-fracture-hud", "");
  hud.setAttribute("aria-label", "Fracture");
  hud.setAttribute("aria-hidden", "true");
  hud.style.cssText =
    "all:initial;position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);margin:0;padding:8px 12px;width:max-content;max-width:calc(100vw - 32px);box-sizing:border-box;border:0;border-radius:0;background:rgba(0,0,0,.75);color:white;opacity:0;text-align:center;font:12px/1.5 system-ui,sans-serif;z-index:2147483647;pointer-events:none;";
  const status = document.createElement("output");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  status.style.cssText =
    "display:block;color:white;font:400 12px/1.5 system-ui,sans-serif;font-variant-numeric:tabular-nums;margin:0;";
  hud.append(status);

  const update = () => {
    status.textContent = message(destroyed);
  };
  const show = () => {
    if (!hasFractured || visible) return;
    visible = true;
    // Re-enter the top layer so the text sits above the fragment canvas.
    if (typeof hud.showPopover === "function") {
      if (hud.matches(":popover-open")) hud.hidePopover();
      hud.showPopover();
    }
    hud.removeAttribute("aria-hidden");
    hud.style.transition = "opacity 2500ms ease";
    hud.style.opacity = ".6";
  };
  const hide = () => {
    visible = false;
    hud.setAttribute("aria-hidden", "true");
    hud.style.transition = "none";
    hud.style.opacity = "0";
  };
  const storage = (event: StorageEvent) => {
    if (storageKey === null) return;
    if (event.key !== null && event.key !== storageKey) return;
    destroyed = readCount(destroyed);
    update();
  };
  update();
  document.body.append(hud);
  // Show after the canvas so the text also stays above fragments in the top layer.
  if (typeof hud.showPopover === "function") {
    hud.setAttribute("popover", "manual");
    hud.showPopover();
  }
  window.addEventListener("storage", storage);

  return {
    show,
    hide,
    recordDestruction() {
      hasFractured = true;
      hide();
      destroyed = Math.min(
        Number.MAX_SAFE_INTEGER,
        Math.max(destroyed, readCount(destroyed)) + 1,
      );
      try {
        if (storageKey !== null)
          window.localStorage.setItem(storageKey, String(destroyed));
      } catch {
        // Restricted/quota-exhausted storage should not prevent the effect or session tally.
      }
      update();
    },
    dispose() {
      window.removeEventListener("storage", storage);
      hud.remove();
    },
  };
}
