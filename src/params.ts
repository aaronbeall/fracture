/** Shape of the crack network produced by `fracture()`. */
export interface FractureParams {
  /** Major cracks leaving the impact; subdivision determines the final piece count. */
  radialCracks: number;
  /** Logarithmic variation in spacing between major cracks; 0 is evenly spaced. */
  radialVariation: number;
  /** Maximum subdivision depth. Individual branches usually stop much earlier. */
  generations: number;
  /** Likelihood of another split once a branch is near its local fragment size. */
  branchProbability: number;
  /** Maximum cant of each new cross-crack, in radians from the radial normal. */
  branchAngle: number;
  /** Logarithmic variation in local fragment size, inherited by child branches. */
  sizeVariation: number;
  /** Smallest characteristic fragment area as a fraction of the original surface. */
  coreAreaFraction: number;
  /** Fragment area grows with squared distance from the impact. Larger = bigger outer shards. */
  outwardAreaGrowth: number;
  /** How far a split can stray from the middle of its polygon's projection (0–1). */
  splitImbalance: number;
}

/** Initial blast applied to each piece, before motion limits. */
export interface ImpulseParams {
  /** Screen pixels over which blast strength drops to 1/e. Larger reaches farther. */
  forceDistance: number;
  /** Speed in pixels per simulation second, before distance falloff. */
  outwardSpeed: number;
  /** Inward x/y bias at an element edge, relative to outward force. 0 disables it. */
  centerBiasStrength: number;
  towardCameraSpeedMin: number;
  towardCameraSpeedMax: number;
  /** Per-piece variation: 0.4 means 60–140% strength. */
  forceVariation: number;
  /** Per-piece direction variation in ±radians. */
  directionVariation: number;
  /** Tangential force relative to outward force. */
  spiralAmount: number;
  /** Rotation multiplier and fractional variation on each rotation axis. */
  spinMultiplier: number;
  spinVariation: number;
}

export const DEFAULT_FRACTURE_PARAMS: Readonly<FractureParams> = {
  radialCracks: 18,
  radialVariation: 1.8,
  generations: 9,
  branchProbability: 0.72,
  branchAngle: 1,
  sizeVariation: 1.8,
  coreAreaFraction: 0.000025,
  outwardAreaGrowth: 0.12,
  splitImbalance: 0.7,
};

/** Coarser pattern used when an already-flying shard is hit again. */
export const REFRACTURE_PARAMS: Readonly<FractureParams> = {
  ...DEFAULT_FRACTURE_PARAMS,
  radialCracks: 4,
  generations: 3,
  coreAreaFraction: 0.004,
};

export const DEFAULT_IMPULSE_PARAMS: Readonly<ImpulseParams> = {
  forceDistance: 180,
  outwardSpeed: 1050,
  centerBiasStrength: 1,
  towardCameraSpeedMin: 350,
  towardCameraSpeedMax: 1400,
  forceVariation: 0.4,
  directionVariation: 0.35,
  spiralAmount: 0.38,
  spinMultiplier: 2,
  spinVariation: 0.35,
};
