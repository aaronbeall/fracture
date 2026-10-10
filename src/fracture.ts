import { FRACTURE_TUNING } from "./tuning";

/** Convex polygons stay convex as cracks propagate, including recursive fractures. */
export interface Point {
  x: number;
  y: number;
}
export type Polygon = Point[];

export function vertex(polygon: Polygon, index: number): Point {
  const point = polygon[index % polygon.length];
  if (!point) throw new Error("A fracture polygon must have vertices");
  return point;
}

export function area(polygon: Polygon): number {
  return (
    Math.abs(
      polygon.reduce((sum, p, i) => {
        const q = vertex(polygon, i + 1);
        return sum + p.x * q.y - q.x * p.y;
      }, 0),
    ) / 2
  );
}

export function center(polygon: Polygon): Point {
  return {
    x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length,
    y: polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length,
  };
}

/** Cut a convex polygon by a crack line, preserving its area on both sides. */
export function split(
  polygon: Polygon,
  normal: Point,
  offset: number,
): [Polygon, Polygon] {
  const sides: [Polygon, Polygon] = [[], []];
  for (let i = 0; i < polygon.length; i++) {
    const a = vertex(polygon, i);
    const b = vertex(polygon, i + 1);
    const da = a.x * normal.x + a.y * normal.y - offset;
    const db = b.x * normal.x + b.y * normal.y - offset;
    sides[da <= 0 ? 0 : 1].push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      const intersection = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      };
      sides[0].push(intersection);
      sides[1].push(intersection);
    } else if (da === 0) {
      sides[1].push(a);
    }
  }
  return sides;
}

export function contains(polygon: Polygon, p: Point): boolean {
  if (
    p.x < Math.min(...polygon.map((v) => v.x)) - 1e-7 ||
    p.x > Math.max(...polygon.map((v) => v.x)) + 1e-7 ||
    p.y < Math.min(...polygon.map((v) => v.y)) - 1e-7 ||
    p.y > Math.max(...polygon.map((v) => v.y)) + 1e-7
  )
    return false;
  let positive = false;
  let negative = false;
  polygon.forEach((a, i) => {
    const b = vertex(polygon, i + 1);
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const tolerance = Math.hypot(b.x - a.x, b.y - a.y) * 1e-7;
    positive ||= cross > tolerance;
    negative ||= cross < -tolerance;
  });
  return !(positive && negative);
}

/**
 * Uneven radial cracks form the major shards. Each shard then branches through
 * independently canted, off-center cuts. Branches inherit a variable grain size
 * and stop at different generations, leaving large plates beside small splinters.
 * The local grain gets finer near the impact; no rings or target piece count.
 */
export function fracture(
  polygon: Polygon,
  impact: Point,
  profile: "surface" | "fragment" = "surface",
  random = Math.random,
): Polygon[] {
  const centroid = center(polygon);
  const sourceArea = area(polygon);
  const minimumArea = sourceArea * 1e-12;
  const settings = FRACTURE_TUNING;
  const maxGeneration =
    profile === "fragment" ? 3 : settings.fractureGenerations;
  const coreArea =
    sourceArea * (profile === "fragment" ? 0.004 : settings.coreAreaFraction);
  const hit = contains(polygon, impact) ? impact : centroid;
  // Keep edge/corner hits just inside the surface to avoid degenerate radial fans.
  const origin = {
    x: hit.x * 0.999 + centroid.x * 0.001,
    y: hit.y * 0.999 + centroid.y * 0.001,
  };
  const rayCount = profile === "fragment" ? 4 : settings.radialCracks;
  const angles = polygon.map((p) => Math.atan2(p.y - origin.y, p.x - origin.x));
  let angle = random() * Math.PI * 2;
  const spacing = Array.from({ length: rayCount }, () =>
    Math.exp((random() - 0.5) * settings.radialVariation),
  );
  const circumference = spacing.reduce((sum, gap) => sum + gap, 0);
  for (let i = 0; i < rayCount; i++) {
    angles.push(Math.atan2(Math.sin(angle), Math.cos(angle)));
    angle += ((spacing[i] ?? 0) / circumference) * Math.PI * 2;
  }
  angles.sort((a, b) => a - b);
  const boundary = angles.map((angle) => {
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    let distance = Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const a = vertex(polygon, i);
      const b = vertex(polygon, i + 1);
      const edge = { x: b.x - a.x, y: b.y - a.y };
      const denominator = direction.x * edge.y - direction.y * edge.x;
      if (Math.abs(denominator) < 1e-9) continue;
      const dx = a.x - origin.x;
      const dy = a.y - origin.y;
      const t = (dx * edge.y - dy * edge.x) / denominator;
      const u = (dx * direction.y - dy * direction.x) / denominator;
      if (t >= 0 && u >= -1e-7 && u <= 1 + 1e-7)
        distance = Math.min(distance, t);
    }
    return {
      x: origin.x + direction.x * distance,
      y: origin.y + direction.y * distance,
    };
  });
  const pieces: Polygon[] = [];
  const subdivide = (piece: Polygon, generation: number, grain: number) => {
    const pieceArea = area(piece);
    if (piece.length < 3 || pieceArea <= minimumArea) return;
    const c = center(piece);
    const distance = Math.hypot(c.x - origin.x, c.y - origin.y);
    const localArea =
      (coreArea + distance * distance * settings.outwardAreaGrowth) * grain;
    const touchesImpact = contains(piece, origin);
    if (
      generation >= maxGeneration ||
      pieceArea < coreArea * 0.3 ||
      (!touchesImpact &&
        (pieceArea < localArea * 0.35 ||
          random() >
            settings.branchProbability * Math.min(1, pieceArea / localArea)))
    ) {
      pieces.push(piece);
      return;
    }

    // Every generation chooses its own crack direction and offset. Adjacent
    // branches never share a ring index, orientation, or compulsory split depth.
    const direction =
      Math.atan2(c.y - origin.y, c.x - origin.x) +
      (random() * 2 - 1) * settings.branchAngle;
    const normal = { x: Math.cos(direction), y: Math.sin(direction) };
    const projections = piece.map((p) => p.x * normal.x + p.y * normal.y);
    const low = Math.min(...projections);
    const high = Math.max(...projections);
    const fraction = 0.5 + (random() - 0.5) * settings.splitImbalance;
    const children = split(piece, normal, low + (high - low) * fraction);
    if (
      children.some((child) => child.length < 3 || area(child) <= minimumArea)
    ) {
      pieces.push(piece);
      return;
    }
    for (const child of children) {
      const inheritedGrain = Math.max(
        0.15,
        Math.min(
          6,
          grain * Math.exp((random() - 0.5) * settings.sizeVariation * 0.5),
        ),
      );
      subdivide(child, generation + 1, inheritedGrain);
    }
  };
  for (let i = 0; i < boundary.length; i++) {
    subdivide(
      [origin, vertex(boundary, i), vertex(boundary, i + 1)],
      0,
      Math.exp((random() - 0.5) * settings.sizeVariation),
    );
  }
  return pieces;
}

/** Distance is in screen pixels so the same blast feels consistent on every surface. */
export function impulseFalloff(distance: number): number {
  return Math.exp(-Math.max(0, distance) / FRACTURE_TUNING.forceDistance);
}
