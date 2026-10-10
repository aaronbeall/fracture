import type { FractureEverythingOptions } from "./everything";

export type { FractureEverythingOptions, SpeedControls } from "./everything";
export type { HudOptions } from "./hud";

/** Up, up, down, down, left, right, left, right, B, A. */
export const KONAMI_CODE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

/**
 * What arms the effect:
 * - `"konami"`: the Konami code.
 * - `{ sequence }`: a phrase typed anywhere. Case, spaces and punctuation that
 *   aren't in the phrase are ignored, so "ya done messed up aaron!" also
 *   matches "YA DONE, MESSED UP A-A-RON!".
 * - `{ keys }`: a keyboard shortcut such as `"ctrl+shift+f"`.
 * - `{ clicks, target }`: rapid clicks on an element or selector (default 5 within 2s).
 * - A function that receives `activate` and may return a cleanup.
 */
export type Trigger =
  | "konami"
  | { sequence: string }
  | { keys: string }
  | { clicks?: number; target: Element | string; within?: number }
  | ((activate: () => void) => void | (() => void));

export interface EasterEggOptions extends FractureEverythingOptions {
  /** Defaults to the Konami code. */
  triggers?: Trigger[];
  /** Aborting uninstalls the triggers and ends an active session. */
  signal?: AbortSignal;
}

/**
 * Turn the whole page into a breakable surface until Escape. Loads Three.js
 * on first use. Resolves to a function that restores the page.
 */
export async function fractureEverything({
  signal,
  ...options
}: FractureEverythingOptions & { signal?: AbortSignal } = {}): Promise<
  () => void
> {
  if (signal?.aborted || typeof document === "undefined") return () => {};
  const { activate } = await import("./everything");
  if (signal?.aborted) return () => {};
  const dispose = activate(options);
  signal?.addEventListener("abort", dispose, { once: true });
  return () => {
    signal?.removeEventListener("abort", dispose);
    dispose();
  };
}

const ignoredKey = (event: KeyboardEvent) =>
  event.repeat ||
  event.isComposing ||
  event.ctrlKey ||
  event.metaKey ||
  event.altKey;

/** Advance through `tokens` as keys arrive; a wrong key restarts the match. */
function sequenceListener(
  tokens: string[],
  significant: (key: string) => boolean,
  onMatch: () => void,
) {
  let progress = 0;
  return (event: KeyboardEvent) => {
    if (ignoredKey(event)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!significant(key)) return;
    progress =
      key === tokens[progress] ? progress + 1 : key === tokens[0] ? 1 : 0;
    if (progress < tokens.length) return;
    progress = 0;
    onMatch();
  };
}

function phraseListener(phrase: string, onMatch: () => void) {
  const word = /[\p{L}\p{N}]/u;
  const chars = Array.from(phrase.toLowerCase()).filter((c) => c.trim());
  const symbols = new Set(chars.filter((c) => !word.test(c)));
  const tokens = chars.filter((c) => word.test(c) || symbols.has(c));
  return sequenceListener(
    tokens,
    (key) => key.length === 1 && (word.test(key) || symbols.has(key)),
    onMatch,
  );
}

function shortcutListener(shortcut: string, onMatch: () => void) {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.pop() ?? "";
  const mods = new Set(parts);
  return (event: KeyboardEvent) => {
    if (event.repeat) return;
    if (
      event.ctrlKey !== mods.has("ctrl") ||
      event.metaKey !== (mods.has("meta") || mods.has("cmd")) ||
      event.altKey !== (mods.has("alt") || mods.has("option")) ||
      event.shiftKey !== mods.has("shift")
    )
      return;
    const code = event.code.toLowerCase();
    if (
      event.key.toLowerCase() !== key &&
      code !== key &&
      code !== `key${key}` &&
      code !== `digit${key}`
    )
      return;
    event.preventDefault();
    onMatch();
  };
}

function install(trigger: Trigger, activate: () => void): () => void {
  if (typeof trigger === "function") return trigger(activate) ?? (() => {});
  if (trigger === "konami" || "sequence" in trigger || "keys" in trigger) {
    const keydown =
      trigger === "konami"
        ? sequenceListener(
            KONAMI_CODE,
            (key) => !["Shift", "Control", "Alt", "Meta"].includes(key),
            activate,
          )
        : "sequence" in trigger
          ? phraseListener(trigger.sequence, activate)
          : shortcutListener(trigger.keys, activate);
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }
  const { clicks = 5, target, within = 2000 } = trigger;
  let times: number[] = [];
  const click = (event: MouseEvent) => {
    const node = event.target instanceof Element ? event.target : null;
    const hit =
      typeof target === "string"
        ? node?.closest(target)
        : target.contains(node);
    if (!hit) return;
    const now = performance.now();
    times = [...times.filter((time) => now - time < within), now];
    if (times.length < clicks) return;
    times = [];
    activate();
  };
  document.addEventListener("click", click);
  return () => document.removeEventListener("click", click);
}

/**
 * Arm a hidden "fracture everything" mode behind one or more triggers.
 * Returns a function that removes the triggers and ends any active session.
 */
export function installEasterEgg({
  triggers = ["konami"],
  signal,
  ...options
}: EasterEggOptions = {}): () => void {
  if (signal?.aborted || typeof window === "undefined") return () => {};
  const controller = new AbortController();
  let loading = false;
  const activate = () => {
    if (loading || controller.signal.aborted) return;
    loading = true;
    void fractureEverything({ ...options, signal: controller.signal })
      .then((cleanup) => {
        if (controller.signal.aborted) cleanup();
      })
      .catch((error) => console.warn("Fracture could not start", error))
      .finally(() => {
        loading = false;
      });
  };
  const removers = triggers.map((trigger) => install(trigger, activate));
  const uninstall = () => {
    if (controller.signal.aborted) return;
    controller.abort();
    removers.forEach((remove) => remove());
    signal?.removeEventListener("abort", uninstall);
  };
  signal?.addEventListener("abort", uninstall, { once: true });
  return uninstall;
}
