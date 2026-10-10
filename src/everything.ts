import { createHud, type HudOptions } from "./hud.js";
import { createStage } from "./stage.js";
import type { Point } from "./fracture.js";
import type { StageOptions } from "./types.js";

export interface SpeedControls {
  /** Factor applied per + / - press. */
  step: number;
  min: number;
  max: number;
}

export interface FractureEverythingOptions extends StageOptions {
  /** Running total shown after pieces settle; `false` hides it. */
  hud?: boolean | HudOptions;
  /** + / - change simulation speed; `false` disables them. */
  speedControls?: boolean | Partial<SpeedControls>;
  /** Keys that end the session and restore the page. Defaults to Escape. */
  exitKeys?: string[];
  /** Cursor while active, or `false` to leave the page's cursor alone. */
  cursor?: string | false;
  /** Called when the session ends for any reason. */
  onExit?: () => void;
}

const defaultSpeed: SpeedControls = { step: 1.25, min: 0.01, max: 2 };
const sessions = new WeakMap<Document, () => void>();

/**
 * Make every visible element breakable: clicks, Enter/Space on a focused
 * control, or F at the pointer fracture it. Repeated calls return the active
 * session's cleanup.
 */
export function activate(options: FractureEverythingOptions = {}): () => void {
  const existing = sessions.get(document);
  if (existing) return existing;
  const {
    hud: hudOption = true,
    speedControls = true,
    exitKeys = ["Escape"],
    cursor = "crosshair",
    onExit,
    ...stageOptions
  } = options;
  const hud = hudOption ? createHud(hudOption === true ? {} : hudOption) : null;
  const stage = createStage({
    ...stageOptions,
    onFracture(result) {
      hud?.recordDestruction();
      stageOptions.onFracture?.(result);
    },
    onIdle() {
      hud?.show();
      stageOptions.onIdle?.();
    },
  });
  const speed =
    speedControls === false
      ? null
      : {
          ...defaultSpeed,
          ...(speedControls === true ? {} : speedControls),
        };
  const style = document.createElement("style");
  if (cursor)
    style.textContent = `html, html * { cursor: ${cursor} !important; }`;
  document.head.append(style);
  const originalFocus = document.activeElement;
  let lastPointer: Point = { x: innerWidth / 2, y: innerHeight / 2 };
  let stopped = false;

  const fire = (point: Point, target: Element | null) => {
    void stage.strike(point, { target });
  };

  const block = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const pointer = (event: MouseEvent) => {
    lastPointer = { x: event.clientX, y: event.clientY };
  };
  const pointerdown = (event: MouseEvent) => {
    block(event);
    pointer(event);
  };
  const click = (event: MouseEvent) => {
    block(event);
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const rect = target?.getBoundingClientRect();
    const point =
      event.detail === 0 && rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: event.clientX, y: event.clientY };
    fire(point, target);
  };
  const keydown = (event: KeyboardEvent) => {
    if (exitKeys.includes(event.key)) {
      block(event);
      dispose();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (speed && ["+", "=", "-"].includes(event.key)) {
      block(event);
      stage.timeScale = Math.max(
        speed.min,
        Math.min(
          speed.max,
          stage.timeScale * (event.key === "-" ? 1 / speed.step : speed.step),
        ),
      );
      return;
    }
    // Enter/Space shatter the focused control; F shatters at the last pointer location.
    // Leave Tab/Shift+Tab native so keyboard users can reach any surviving control.
    if (!["Enter", " ", "f", "F"].includes(event.key)) return;
    block(event);
    if (event.repeat) return;
    const focused = document.activeElement;
    const usePointer =
      event.key.toLowerCase() === "f" || focused === document.body;
    const bounds = !usePointer ? focused?.getBoundingClientRect() : null;
    const point = bounds
      ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
      : lastPointer;
    fire(
      point,
      usePointer ? document.elementFromPoint(point.x, point.y) : focused,
    );
  };
  const keyup = (event: KeyboardEvent) => {
    if (["Enter", " "].includes(event.key)) block(event);
  };
  const blocked = [
    "mousedown",
    "pointerup",
    "mouseup",
    "dblclick",
    "auxclick",
  ] as const;

  function dispose() {
    if (stopped) return;
    stopped = true;
    sessions.delete(document);
    window.removeEventListener("click", click, true);
    window.removeEventListener("pointerdown", pointerdown, true);
    blocked.forEach((type) => window.removeEventListener(type, block, true));
    window.removeEventListener("pointermove", pointer, true);
    window.removeEventListener("keydown", keydown, true);
    window.removeEventListener("keyup", keyup, true);
    window.removeEventListener("pagehide", dispose);
    stage.dispose();
    style.remove();
    hud?.dispose();
    if (originalFocus instanceof HTMLElement && originalFocus.isConnected)
      originalFocus.focus({ preventScroll: true });
    onExit?.();
  }

  sessions.set(document, dispose);
  window.addEventListener("click", click, true);
  window.addEventListener("pointerdown", pointerdown, true);
  blocked.forEach((type) => window.addEventListener(type, block, true));
  window.addEventListener("pointermove", pointer, true);
  window.addEventListener("keydown", keydown, true);
  window.addEventListener("keyup", keyup, true);
  window.addEventListener("pagehide", dispose);
  return dispose;
}
