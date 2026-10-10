/** Edit these values, then reload the playground and activate the effect again. */
export const FRACTURE_TUNING = {
  /** Major cracks leaving the impact; subdivision determines the final piece count. */
  radialCracks: 18,
  /** Logarithmic variation in spacing between major cracks; 0 is evenly spaced. */
  radialVariation: 1.8,
  /** Maximum subdivision depth. Individual branches usually stop much earlier. */
  fractureGenerations: 9,
  /** Likelihood of another split once a branch is near its local fragment size. */
  branchProbability: 0.72,
  /** Maximum cant of each new cross-crack, in radians from the radial normal. */
  branchAngle: 1,
  /** Logarithmic variation in local fragment size, inherited by child branches. */
  sizeVariation: 1.8,
  /** Smallest characteristic fragment area as a fraction of the original surface. */
  coreAreaFraction: 0.000025,
  /** Fragment area grows with squared distance from the impact. Larger = bigger outer shards. */
  outwardAreaGrowth: 0.12,
  /** How far a split can stray from the middle of its polygon's projection (0–1). */
  splitImbalance: 0.7,
  /** Fraction of the original thickness; 0.5 makes all shards half as thick. */
  thicknessScale: 0.5,

  /** Screen pixels over which blast strength drops to 1/e. Larger reaches farther. */
  forceDistance: 180,
  /** Speeds in pixels per simulation second, before distance falloff. */
  outwardSpeed: 1050,
  /** Inward x/y bias at an element edge, relative to outward force. 0 disables it. */
  centerBiasStrength: 1,
  towardCameraSpeedMin: 350,
  towardCameraSpeedMax: 1400,
  /** Per-piece variation: 0.4 means 60–140% strength; angle is ±radians. */
  forceVariation: 0.4,
  directionVariation: 0.35,
  /** Tangential force relative to outward force. */
  spiralAmount: 0.38,
  /** Rotation multiplier and fractional variation on each rotation axis. */
  spinMultiplier: 2,
  spinVariation: 0.35,
  maxSpeed: 2600,
  /** Radians per simulation second; allows repeated clicks to add spin. */
  maxSpin: 36,

  /** Simulation seconds per real second. */
  timeScale: 0.06,
  /** + / - multiply or divide the current timescale as soon as the effect is active. */
  timeScaleStep: 1.25,
  minTimeScale: 0.01,
  maxTimeScale: 2,
  gravity: 760,
  drag: 0.12,

  /** Virtual lens aperture radius in scene pixels. Larger = shallower depth of field. */
  apertureRadius: 40,
  /** Maximum blur radius in CSS pixels. */
  maxBlurRadius: 32,
  /** Maximum blur-buffer pixels per CSS pixel. Focused faces stay full resolution. */
  blurResolutionScale: 0.5,
  /** Dense aperture radius in buffer pixels. Larger = finer bokeh at higher GPU cost. */
  apertureKernelRadius: 5,

  /** Bounds GPU work when several elements have been shattered. */
  maxShards: 2400,
} as const;
