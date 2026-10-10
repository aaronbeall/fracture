import { impulseFalloff, type Point } from "./fracture";
import { FRACTURE_TUNING as tuning } from "./tuning";

const noBias: Point = { x: 0, y: 0 };

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

/** Sample a noisy blast in world coordinates from a screen-space displacement. */
export function sampleImpulse(
  dx: number,
  dy: number,
  random = Math.random,
  bias: Point = noBias,
) {
  const jitter = (amount: number) => (random() * 2 - 1) * amount;
  const distance = Math.hypot(dx, dy);
  const strength =
    impulseFalloff(distance) * (1 + jitter(tuning.forceVariation));
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
