import type {
  FractureElementOptions,
  FractureResult,
  FractureStage,
  PointLike,
  StageOptions,
  StrikeOptions,
} from "./types";

export type {
  FractureElementOptions,
  FractureResult,
  FractureStage,
  PointLike,
  StageOptions,
  StrikeOptions,
} from "./types";
export type { Point, Polygon } from "./fracture";
export {
  DEFAULT_BLUR_PARAMS,
  DEFAULT_FRACTURE_PARAMS,
  DEFAULT_IMPULSE_PARAMS,
  DEFAULT_MOTION_PARAMS,
  REFRACTURE_PARAMS,
  type BlurParams,
  type FractureParams,
  type ImpulseParams,
  type MotionParams,
} from "./params";

/**
 * Create a fracture overlay. Three.js and DOM capture load on first call, so
 * importing this module costs almost nothing.
 */
export async function createFractureStage(
  options?: StageOptions,
): Promise<FractureStage> {
  if (typeof document === "undefined")
    throw new Error("Fracture needs a browser document");
  const { createStage } = await import("./stage");
  return createStage(options);
}

let shared: Promise<FractureStage> | undefined;

/** The page-wide stage used by `fracture()` and `strike()`, created on demand. */
export async function getFractureStage(): Promise<FractureStage> {
  const stage = await (shared ??= createFractureStage());
  if (!stage.disposed) return stage;
  shared = undefined;
  return getFractureStage();
}

/** Break an element into flying pieces on the shared stage. */
export async function fracture(
  element: Element,
  options?: FractureElementOptions,
): Promise<FractureResult> {
  return (await getFractureStage()).fracture(element, options);
}

/** Break whatever is at a viewport point on the shared stage. */
export async function strike(
  at: PointLike,
  options?: StrikeOptions,
): Promise<boolean> {
  return (await getFractureStage()).strike(at, options);
}
