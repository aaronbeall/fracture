import type { Point } from "./fracture.js";
import type {
  BlurParams,
  FractureParams,
  ImpulseParams,
  MotionParams,
} from "./params.js";

/** Viewport coordinates, or anything with `clientX`/`clientY` such as a mouse event. */
export type PointLike =
  Point | { clientX: number; clientY: number; detail?: number };

export interface StageOptions {
  /** Crack pattern for elements. */
  fracture?: Partial<FractureParams>;
  /** Crack pattern when a flying shard is struck again. */
  refracture?: Partial<FractureParams>;
  /** Initial blast on each piece. */
  impulse?: Partial<ImpulseParams>;
  /** Gravity, drag, slow motion and limits. */
  motion?: Partial<MotionParams>;
  /** Depth-of-field blur, or `false` to draw pieces sharp. */
  blur?: Partial<BlurParams> | false;
  /** CSS z-index of the overlay canvas. */
  zIndex?: number;
  /** Called each time an element breaks, however it was triggered. */
  onFracture?: (result: FractureResult) => void;
  /** Called when the last piece leaves and no capture is pending. */
  onIdle?: () => void;
}

export interface FractureElementOptions {
  /**
   * Impact point in viewport coordinates. Defaults to the element's center, as
   * does a keyboard-generated click event (`detail === 0`).
   */
  at?: PointLike;
  /** Hide the original element while its pieces fly. Defaults to `true`. */
  hide?: boolean;
  /** Per-call crack pattern overrides. */
  fracture?: Partial<FractureParams>;
  /** Per-call blast overrides. */
  impulse?: Partial<ImpulseParams>;
}

export interface FractureResult {
  element: Element;
  /** Number of pieces the element broke into. */
  pieces: number;
  /** Resolves once every piece from this fracture has left the screen or been cleared. */
  settled: Promise<void>;
  /** Show the original element again. Its pieces keep flying. */
  restore(): void;
}

export interface StrikeOptions {
  /** Element to fracture if no shard is hit; defaults to the painted element under the point. */
  target?: Element | null;
}

export interface FractureStage {
  /**
   * Capture an element, hide it, and replace it with flying pieces.
   * Rejects if the element cannot be captured (off screen, cross-origin
   * images, already fractured), in which case the page is left untouched.
   */
  fracture(
    element: Element,
    options?: FractureElementOptions,
  ): Promise<FractureResult>;
  /**
   * Hit whatever is at a point: re-break a flying shard, or else fracture the
   * nearest painted element. Resolves `true` if something broke.
   */
  strike(at: PointLike, options?: StrikeOptions): Promise<boolean>;
  /** Resolves when no pieces are flying and no capture is pending. */
  idle(): Promise<void>;
  /** Remove all flying pieces immediately. Hidden elements stay hidden. */
  clear(): void;
  /** Remove all pieces and show every hidden element again. */
  restore(): void;
  /** Simulation seconds per real second. */
  timeScale: number;
  readonly shardCount: number;
  readonly disposed: boolean;
  /** Restore the page and release the WebGL context. Safe to call twice. */
  dispose(): void;
}
