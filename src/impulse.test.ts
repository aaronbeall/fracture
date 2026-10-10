import { describe, expect, it } from "vitest";
import { impactBias, sampleImpulse } from "./impulse";

describe("element-centered force bias", () => {
  it.each([
    [400, 300, 0, 0],
    [400, 600, 0, -1],
    [800, 600, -1, -1],
    [0, 0, 1, 1],
    [600, 450, -0.5, -0.5],
  ])("maps impact (%i, %i) to an inward direction", (x, y, bx, by) => {
    expect(impactBias({ x, y }, 800, 600)).toEqual({ x: bx, y: by });
  });

  it("normalizes by element size and bounds clicks outside the original surface", () => {
    expect(impactBias({ x: 600, y: 450 }, 800, 600)).toEqual(
      impactBias({ x: 60, y: 45 }, 80, 60),
    );
    expect(impactBias({ x: 2000, y: -1000 }, 800, 600)).toEqual({
      x: -1,
      y: 1,
    });
    expect(impactBias({ x: 0, y: 0 }, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("keeps centered impulses exactly unchanged", () => {
    const bias = impactBias({ x: 400, y: 300 }, 800, 600);
    expect(sampleImpulse(80, -20, { random: () => 0.5, bias })).toEqual(
      sampleImpulse(80, -20, { random: () => 0.5 }),
    );
  });

  it("adds upward bias to every piece for a bottom-center click, without horizontal bias", () => {
    const bias = impactBias({ x: 400, y: 550 }, 800, 600);
    for (const [dx, dy] of [
      [-100, 0],
      [100, 0],
      [0, -100],
      [0, 100],
    ] as const) {
      const before = sampleImpulse(dx, dy, { random: () => 0.5 });
      const after = sampleImpulse(dx, dy, { random: () => 0.5, bias });
      expect(after.velocity.x).toBe(before.velocity.x);
      // World +y points up, while DOM +y points down.
      expect(after.velocity.y).toBeGreaterThan(before.velocity.y);
      expect(after.velocity.z).toBe(before.velocity.z);
      expect(after.spin).toEqual(before.spin);
    }
  });

  it("adds up-left bias to impulses from a lower-right click", () => {
    const bias = impactBias({ x: 700, y: 500 }, 800, 600);
    for (const [dx, dy] of [
      [-100, 0],
      [100, 0],
      [0, -100],
      [0, 100],
    ] as const) {
      const before = sampleImpulse(dx, dy, { random: () => 0.5 }).velocity;
      const after = sampleImpulse(dx, dy, { random: () => 0.5, bias }).velocity;
      expect(after.x).toBeLessThan(before.x);
      expect(after.y).toBeGreaterThan(before.y);
    }
  });
});
