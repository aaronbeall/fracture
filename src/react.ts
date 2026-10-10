import { useEffect } from "react";
import { setupFracture } from "./index";

export function useFracture({
  enabled = false,
}: { enabled?: boolean } = {}): void {
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const sequence = "yadonemessedupaaron!";
    let progress = 0;
    let loading = false;
    let dispose: (() => void) | undefined;
    const keydown = (event: KeyboardEvent) => {
      if (
        loading ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const key = event.key.toLowerCase();
      if (!/^[\p{L}!]$/u.test(key)) return;
      progress = key === sequence[progress] ? progress + 1 : 0;
      if (progress !== sequence.length) return;
      progress = 0;
      loading = true;
      void setupFracture({ signal: controller.signal })
        .then((cleanup) => {
          if (controller.signal.aborted) cleanup();
          else dispose = cleanup;
        })
        .catch((error) => console.warn("Fracture could not start", error))
        .finally(() => {
          loading = false;
        });
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      controller.abort();
      dispose?.();
    };
  }, [enabled]);
}
