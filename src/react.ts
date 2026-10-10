import { useEffect, useMemo, useRef } from "react";
import { createFractureStage, getFractureStage } from "./index.js";
import { installEasterEgg, type EasterEggOptions } from "./easter-egg.js";
import type {
  FractureElementOptions,
  FractureResult,
  FractureStage,
  PointLike,
  StageOptions,
  StrikeOptions,
} from "./types.js";

/** An element, a ref to one, or nothing (ignored). */
export type FractureTarget = Element | { current: Element | null } | null;

export interface FractureControls {
  /** Break an element; resolves `null` if the target is empty. Rejects if capture fails. */
  fracture(
    target: FractureTarget,
    options?: FractureElementOptions,
  ): Promise<FractureResult | null>;
  /** Break a flying shard or the painted element at a point. */
  strike(at: PointLike, options?: StrikeOptions): Promise<boolean>;
  /** Show every element this hook hid. Pieces in flight continue. */
  restore(): void;
  /** The underlying stage, created on first use. */
  stage(): Promise<FractureStage>;
}

/**
 * Fracture specific elements on demand. Without options this uses the shared
 * page-wide stage, so pieces keep flying after the calling component unmounts.
 * With options it owns a stage that is disposed once its pieces settle after
 * unmount. Options are read when the stage is first created.
 */
export function useFracture(options?: StageOptions): FractureControls {
  const latest = useRef(options);
  latest.current = options;
  const owned = options !== undefined;
  const state = useRef<{
    stage?: Promise<FractureStage>;
    results: Set<FractureResult>;
  }>({ results: new Set() });

  useEffect(() => {
    const current = state.current;
    return () => {
      const pending = current.stage;
      current.stage = undefined;
      if (owned && pending)
        void pending.then(async (stage) => {
          await stage.idle();
          stage.dispose();
        });
    };
  }, [owned]);

  return useMemo<FractureControls>(() => {
    const stage = () => {
      const current = state.current;
      if (!owned) return getFractureStage();
      current.stage ??= createFractureStage(latest.current);
      return current.stage;
    };
    return {
      stage,
      async fracture(target, options) {
        const element = target && "current" in target ? target.current : target;
        if (!element) return null;
        const result = await (await stage()).fracture(element, options);
        state.current.results.add(result);
        void result.settled.then(() => {
          if (!result.element.isConnected) state.current.results.delete(result);
        });
        return result;
      },
      async strike(at, options) {
        return (await stage()).strike(at, options);
      },
      restore() {
        state.current.results.forEach((result) => result.restore());
        state.current.results.clear();
      },
    };
  }, [owned]);
}

export interface FractureEasterEggOptions extends EasterEggOptions {
  /** Defaults to `true`. */
  enabled?: boolean;
}

/**
 * Arm the "fracture everything" easter egg while mounted and enabled.
 * Options are read when the hook enables; callbacks always see the latest
 * render. Disabling or unmounting removes the triggers and ends a session.
 */
export function useFractureEasterEgg({
  enabled = true,
  ...options
}: FractureEasterEggOptions = {}): void {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    if (!enabled) return;
    const { signal: _signal, ...rest } = latest.current;
    return installEasterEgg({
      ...rest,
      onExit: () => latest.current.onExit?.(),
      onFracture: (result) => latest.current.onFracture?.(result),
    });
  }, [enabled]);
}
