import { describe, expect, it } from "vitest";
import {
  area,
  center,
  contains,
  fracture,
  rectangle,
  type Polygon,
} from "./fracture";
import { impulseFalloff, sampleImpulse } from "./impulse";
import {
  DEFAULT_FRACTURE_PARAMS,
  DEFAULT_IMPULSE_PARAMS,
  REFRACTURE_PARAMS,
} from "./params";

function random(seed = 17) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

describe("impact fracture network", () => {
  it.each([
    { x: 400, y: 250 },
    { x: 0, y: 0 },
    { x: 800, y: 250 },
    { x: 20, y: 480 },
  ])("tiles the original surface without gaps at $x,$y", (impact) => {
    const original = rectangle(800, 500);
    const pieces = fracture(original, impact, { random: random() });
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.reduce((sum, piece) => sum + area(piece), 0)).toBeCloseTo(
      area(original),
      5,
    );
    for (const piece of pieces) {
      expect(area(piece)).toBeGreaterThan(0);
      expect(
        piece.every(
          (point) =>
            Number.isFinite(point.x) &&
            Number.isFinite(point.y) &&
            contains(original, point),
        ),
      ).toBe(true);
      expect(contains(piece, center(piece))).toBe(true);
    }
    // Interior sample points belong to exactly one piece (detects overlapping cracks).
    for (let x = 9.13; x < 800; x += 59.17)
      for (let y = 7.31; y < 500; y += 47.21) {
        expect(
          pieces.filter((piece) => contains(piece, { x, y })),
        ).toHaveLength(1);
      }
  });

  it("keeps the same detail at every size and concentrates fine fragments near the impact", () => {
    const small = fracture(
      rectangle(20, 14),
      { x: 10, y: 7 },
      { random: random() },
    );
    const pieces = fracture(
      rectangle(1000, 700),
      { x: 500, y: 350 },
      { random: random() },
    );
    expect(small).toHaveLength(pieces.length);
    pieces.forEach((piece, i) => {
      const scaled = small[i];
      if (!scaled) throw new Error("Expected corresponding small fragment");
      expect(scaled).toHaveLength(piece.length);
      piece.forEach((point, j) => {
        expect(scaled[j]?.x).toBeCloseTo(point.x / 50, 7);
        expect(scaled[j]?.y).toBeCloseTo(point.y / 50, 7);
      });
    });
    const near = pieces.filter(
      (p) => Math.hypot(center(p).x - 500, center(p).y - 350) < 60,
    );
    const far = pieces.filter(
      (p) => Math.hypot(center(p).x - 500, center(p).y - 350) > 300,
    );
    const average = (p: Polygon[]) =>
      p.reduce((sum, piece) => sum + area(piece), 0) / p.length;
    expect(average(near)).toBeLessThan(average(far) / 3);
  });

  it("recursively fractures an irregular moving shard without losing its surface", () => {
    const parent = fracture(
      rectangle(700, 500),
      { x: 120, y: 260 },
      { random: random() },
    ).sort((a, b) => area(b) - area(a))[0];
    if (!parent) throw new Error("Expected a fracture surface");
    const children = fracture(parent, center(parent), {
      ...REFRACTURE_PARAMS,
      random: random(42),
    });
    expect(children.length).toBeGreaterThan(3);
    expect(children.reduce((sum, piece) => sum + area(piece), 0)).toBeCloseTo(
      area(parent),
      6,
    );
    expect(
      children.every((piece) => piece.every((p) => contains(parent, p))),
    ).toBe(true);
  });

  it.each([17, 42, 91])(
    "mixes generations and canted cuts within the same impact zone (seed %i)",
    (seed) => {
      const hit = { x: 500, y: 350 };
      const pieces = fracture(rectangle(1000, 700), hit, {
        random: random(seed),
      });
      const middleAreas = pieces
        .filter((piece) => {
          const c = center(piece);
          const distance = Math.hypot(c.x - hit.x, c.y - hit.y);
          return distance > 120 && distance < 280;
        })
        .map(area)
        .sort((a, b) => a - b);
      const small = middleAreas[Math.floor(middleAreas.length * 0.1)];
      const large = middleAreas[Math.floor(middleAreas.length * 0.9)];
      if (small === undefined || large === undefined)
        throw new Error("Missing middle fracture zone");
      // Size variety must exist at comparable radii, not only between center and edge.
      expect(large / small).toBeGreaterThan(8);

      const crossCracks: number[] = [];
      for (const piece of pieces)
        piece.forEach((a, i) => {
          const b = piece[(i + 1) % piece.length]!;
          if (
            (a.x === b.x && (a.x === 0 || a.x === 1000)) ||
            (a.y === b.y && (a.y === 0 || a.y === 700))
          )
            return;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rx = (a.x + b.x) / 2 - hit.x;
          const ry = (a.y + b.y) / 2 - hit.y;
          const length = Math.hypot(dx, dy) * Math.hypot(rx, ry);
          if (!length) return;
          const alignment = Math.abs(dx * rx + dy * ry) / length;
          if (alignment < 1 - 1e-6) crossCracks.push(alignment);
        });
      // Transverse cuts should commonly deviate by >20° from a concentric ring.
      expect(
        crossCracks.filter((alignment) => alignment > Math.sin(Math.PI / 9))
          .length / crossCracks.length,
      ).toBeGreaterThan(0.35);
    },
  );

  it("is repeatable for a seed and responds to params", () => {
    const surface = rectangle(600, 400);
    const hit = { x: 300, y: 200 };
    expect(fracture(surface, hit, { random: random(5) })).toEqual(
      fracture(surface, hit, { random: random(5) }),
    );
    const coarse = fracture(surface, hit, {
      radialCracks: 6,
      generations: 2,
      random: random(5),
    });
    const fine = fracture(surface, hit, { random: random(5) });
    expect(coarse.length).toBeLessThan(fine.length / 4);
    expect(coarse.reduce((sum, piece) => sum + area(piece), 0)).toBeCloseTo(
      area(surface),
      5,
    );
    expect(DEFAULT_FRACTURE_PARAMS.radialCracks).toBe(18);
  });

  it("uses exponential impulse falloff with almost no force at a distant edge", () => {
    expect(impulseFalloff(0)).toBe(1);
    const distance = DEFAULT_IMPULSE_PARAMS.forceDistance;
    expect(impulseFalloff(distance * 2)).toBeCloseTo(
      impulseFalloff(distance) ** 2,
    );
    expect(impulseFalloff(distance * 6)).toBeLessThan(0.003);
  });

  it("varies force and spin between pieces at the same distance", () => {
    const first = sampleImpulse(100, 0, { random: random(17) });
    const second = sampleImpulse(100, 0, { random: random(42) });
    expect(first.velocity).not.toEqual(second.velocity);
    expect(first.spin).not.toEqual(second.spin);
    expect(first.velocity.y / first.velocity.x).not.toBeCloseTo(
      second.velocity.y / second.velocity.x,
    );
    for (const impulse of [
      first,
      second,
      sampleImpulse(0, 0, { random: random() }),
    ]) {
      expect(impulse.velocity.z).toBeGreaterThan(0);
      expect(
        [
          ...Object.values(impulse.velocity),
          ...Object.values(impulse.spin),
        ].every(Number.isFinite),
      ).toBe(true);
    }
  });

  it("preserves exponential falloff on every axis of a noisy impulse", () => {
    const distance = DEFAULT_IMPULSE_PARAMS.forceDistance;
    const near = sampleImpulse(distance, 0, { random: random() });
    const far = sampleImpulse(distance * 2, 0, { random: random() });
    for (const component of ["velocity", "spin"] as const)
      for (const axis of ["x", "y", "z"] as const)
        expect(far[component][axis]).toBeCloseTo(
          near[component][axis] / Math.E,
        );
  });
});
