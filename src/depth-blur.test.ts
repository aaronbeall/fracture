import { describe, expect, it } from "vitest";
import { apertureKernel } from "./depth-blur";

describe("circular aperture", () => {
  it.each([0, 0.001, 1, 2, 4, 5])(
    "preserves color and opacity at radius %s",
    (radius) => {
      const taps = apertureKernel(radius);
      expect(taps.reduce((sum, tap) => sum + tap.weight, 0)).toBeCloseTo(1, 12);
      expect(
        taps.every((tap) => Number.isFinite(tap.x + tap.y) && tap.weight > 0),
      ).toBe(true);
    },
  );

  it("has a filled, symmetric disk response, without gaps or repeated silhouettes", () => {
    const radius = 5;
    const response = new Map<string, number>();
    // Expand bilinear lookups to the actual impulse response of the GPU filter.
    for (const tap of apertureKernel(radius)) {
      const x = Math.floor(tap.x);
      const f = tap.x - x;
      for (const [px, weight] of [
        [x, tap.weight * (1 - f)],
        [x + 1, tap.weight * f],
      ]) {
        const key = `${px},${tap.y}`;
        response.set(key, (response.get(key) ?? 0) + weight!);
      }
    }
    const sample = (x: number, y: number) => response.get(`${x},${y}`) ?? 0;
    let varianceX = 0;
    let varianceY = 0;
    for (let y = -6; y <= 6; y++) {
      for (let x = -6; x <= 6; x++) {
        const w = sample(x, y);
        expect(w).toBeCloseTo(sample(-x, y), 12);
        expect(w).toBeCloseTo(sample(x, -y), 12);
        expect(w).toBeCloseTo(sample(y, x), 12);
        if (Math.hypot(x, y) < radius - 1)
          expect(w).toBeCloseTo(sample(0, 0), 12);
        if (Math.hypot(x, y) < radius) expect(w).toBeGreaterThan(0);
        if (Math.hypot(x, y) > radius + 1) expect(w).toBe(0);
        varianceX += w * x * x;
        varianceY += w * y * y;
      }
    }
    // A uniform aperture disk has variance R²/4 along either axis.
    expect(varianceX).toBeCloseTo(varianceY, 12);
    expect(Math.abs(varianceX - (radius * radius) / 4)).toBeLessThan(0.2);
  });
});
