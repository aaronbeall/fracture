/** Edit these values, then reload the playground and activate the effect again. */
export const FRACTURE_TUNING = {
  /** Fraction of the original thickness; 0.5 makes all shards half as thick. */
  thicknessScale: 0.5,

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
