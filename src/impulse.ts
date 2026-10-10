import type { Point } from "./fracture.js";
import { DEFAULT_IMPULSE_PARAMS, type ImpulseParams } from "./params.js";

const noBias: Point = { x: 0, y: 0 };

export interface Impulse {
  /** Pixels per simulation second; +y is up and +z is toward the viewer. */
  velocity: { x: number; y: number; z: number };
  /** Radians per simulation second around each axis. */
  spin: { x: number; y: number; z: number };
}

export interface ImpulseOptions extends Partial<ImpulseParams> {
  random?: () => number;
  /** Shared inward push from `impactBias()`. */
  bias?: Point;
}

/** Distance is in screen pixels so the same blast feels consistent on every surface. */
export function impulseFalloff(
  distance: number,
  forceDistance = DEFAULT_IMPULSE_PARAMS.forceDistance,
): number {
  return Math.exp(-Math.max(0, distance) / forceDistance);
}

/** Shared screen-space direction from an element-local impact toward its center. */
export function impactBias(
  impact: Point,
  width: number,
  height: number,
): Point {
  const normalized = (position: number, size: number) =>
    size > 0 ? Math.max(-1, Math.min(1, 1 - (position * 2) / size)) : 0;
  return { x: normalized(impact.x, width), y: normalized(impact.y, height) };
}

/** Sample a noisy blast in world coordinates from a piece's screen-space offset to the impact. */
export function sampleImpulse(
  dx: number,
  dy: number,
  { random = Math.random, bias = noBias, ...params }: ImpulseOptions = {},
): Impulse {
  const tuning = { ...DEFAULT_IMPULSE_PARAMS, ...params };
  const jitter = (amount: number) => (random() * 2 - 1) * amount;
  const distance = Math.hypot(dx, dy);
  const strength =
    impulseFalloff(distance, tuning.forceDistance) *
    (1 + jitter(tuning.forceVariation));
  const angle =
    (distance > 0.01 ? Math.atan2(dy, dx) : random() * Math.PI * 2) +
    jitter(tuning.directionVariation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const spin = tuning.spinMultiplier * strength;
  return {
    velocity: {
      x:
        (cos - sin * tuning.spiralAmount + bias.x * tuning.centerBiasStrength) *
        tuning.outwardSpeed *
        strength,
      y:
        (-sin -
          cos * tuning.spiralAmount -
          bias.y * tuning.centerBiasStrength) *
        tuning.outwardSpeed *
        strength,
      z:
        (tuning.towardCameraSpeedMin +
          random() *
            (tuning.towardCameraSpeedMax - tuning.towardCameraSpeedMin)) *
        strength,
    },
    spin: {
      x: (-sin + jitter(tuning.spinVariation)) * 8 * spin,
      y: (cos + jitter(tuning.spinVariation)) * 8 * spin,
      z: (random() - 0.5) * 12 * spin,
    },
  };
}
