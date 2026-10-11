# Fracture

Ever wanted to fracture your UI into a million pieces and watch the bits
beautifully disperse as if in a hallucinogenic trance? Good news, that's my
specialty, and now you can too!

[![Animation of a bright lime panel shattering into tumbling 3D fragments against the dark playground, with depth-of-field blur on the flying pieces.](docs/images/fracture-preview.gif)](https://aaronbeall.github.io/fracture/playground.html)

### [💥 Live demos →](https://aaronbeall.github.io/fracture/)

```sh
npm install @abeall/fracture
```

- **Want to just use the fracture algorithm for your own fractured needs?**
  → [The algorithm](#the-algorithm)
- **Want to fracture something in your UI, with precision and care?**
  → [Fracture simulation](#fracture-simulation)
- **Want to just fracture EVERYTHING in your UI?**
  → [Fracture everything](#fracture-everything)
- **Okay, you love fracturing things as much as I do… and you want to be able
  to fracture every site you ever come across?**
  → [Fracture the internet](#fracture-the-internet)

## The algorithm

Pure geometry with no DOM and no dependencies. Give it a convex polygon and an
impact point; get back convex pieces that exactly tile the original. Cracks
radiate from the impact and branch at random angles, with fine splinters near
the hit and big plates farther out. This is a better glass-like shattering approximation than Voronoi, IMO. It runs anywhere: Node, workers, canvas,
SVG, your physics engine.

```ts
import {
  center,
  fracture,
  rectangle,
  sampleImpulse,
  seededRandom,
} from "@abeall/fracture/algorithm";

const impact = { x: 120, y: 90 };
const pieces = fracture(rectangle(400, 300), impact, {
  radialCracks: 12,
  random: seededRandom(42), // repeatable pattern
});

for (const polygon of pieces) {
  // polygon: { x, y }[]; draw it, simulate it, sell it as modern art.
  // Optional: the blast velocity and spin the 3D effect would give this piece.
  const c = center(polygon);
  const { velocity, spin } = sampleImpulse(c.x - impact.x, c.y - impact.y);
}
```

[Algorithm demo](https://aaronbeall.github.io/fracture/inspector.html)

## Fracture simulation

Break a specific element on cue: a modal, a card, a toast. The element is
captured to a texture, hidden (layout is preserved, and it's made `inert` and
`aria-hidden`), and replaced with 3D pieces that fly off in slow motion, with
depth-of-field blur, on a transparent WebGL overlay. Three.js and the capture
code load the first time you fracture something.

```ts
import { fracture } from "@abeall/fracture";

deleteButton.addEventListener("click", async (event) => {
  await fracture(dialog, { at: event }); // impact where the user clicked
  dialog.close();
});
```

The pieces keep flying after you remove the element. If the element stays in
the DOM, it stays hidden until you call `result.restore()`.

### React

```tsx
import { useFracture } from "@abeall/fracture/react";

function ConfirmDelete({ onClose }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { fracture } = useFracture();

  async function destroy(event: React.MouseEvent) {
    await fracture(dialog, { at: event });
    onClose(); // unmount freely; the pieces live on the shared stage
  }

  return (
    <dialog ref={dialog} open>
      <button onClick={destroy}>Delete</button>
    </dialog>
  );
}
```

Pass options to give a component its own stage with its own physics:

```ts
const { fracture } = useFracture({ motion: { gravity: 2400 }, blur: false });
```

[Precision demo](https://aaronbeall.github.io/fracture/precise.html)

## Fracture everything

Turns the whole page into a breakable surface. Click anything to shatter it,
click flying shards to break them again, `+`/`-` change time speed, and
`Escape` puts everything back. Very important essential for every React website.

```ts
import { installEasterEgg } from "@abeall/fracture/easter-egg";

installEasterEgg({
  triggers: [
    "konami", // ↑ ↑ ↓ ↓ ← → ← → B A (the default)
    { sequence: "ya done messed up aaron!" }, // typed anywhere
    { keys: "ctrl+shift+f" }, // shortcut
    { clicks: 5, target: "#logo" }, // rapid clicks
  ],
});
```

Or in React:

```tsx
import { useFractureEasterEgg } from "@abeall/fracture/react";

function App() {
  useFractureEasterEgg({ triggers: ["konami"] });
  return <YourApp />;
}
```

To start it directly, for example from a button, use
`await fractureEverything()`.

[Playground](https://aaronbeall.github.io/fracture/playground.html)
(enter the Konami code)

## Fracture the internet

**Browser extension:** download
[fracture-anything.zip](https://aaronbeall.github.io/fracture/fracture-anything.zip),
unzip it, then:

- **Chrome / Edge / Brave / Arc:** `chrome://extensions` → enable Developer
  mode → **Load unpacked** → select the folder.
- **Firefox:** `about:debugging` → This Firefox → **Load Temporary Add-on** →
  select `manifest.json`.

Click the toolbar button or press `Alt+Shift+F` on any page, then click things.
Press it again, or `Escape`, to restore the page. It only asks for `activeTab`,
so it runs only on the tab where you invoke it.

**Bookmarklet:** drag the button from the
[anywhere page](https://aaronbeall.github.io/fracture/anywhere.html) to your
bookmarks bar, or make a bookmark with this URL:

```js
javascript: (() => {
  const s = document.createElement("script");
  s.src = "https://aaronbeall.github.io/fracture/fracture-anywhere.js";
  s.onload = () => s.remove();
  document.documentElement.append(s);
})();
```

Sites with a strict Content Security Policy block bookmarklet scripts. The
extension usually works on those sites anyway.

The self-contained script also ships in the npm package as
`dist/fracture-anywhere.js`, so you can load it from
`https://cdn.jsdelivr.net/npm/@abeall/fracture/dist/fracture-anywhere.js`.

---

## API

### `@abeall/fracture/algorithm`

No DOM, no dependencies. Points are `{ x, y }`; polygons are `Point[]` in
screen orientation (+y down).

| Export                                                                   | Description                                                                                                                                                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fracture(polygon, impact, options?)`                                    | Split a convex polygon into convex pieces. `options` is a partial [`FractureParams`](#fractureparams) plus `random`.                                                             |
| `sampleImpulse(dx, dy, options?)`                                        | `{ velocity, spin }` for a piece offset `(dx, dy)` from the impact. Partial [`ImpulseParams`](#impulseparams) plus `random` and `bias`. Velocity is +y up, +z toward the viewer. |
| `impactBias(impact, width, height)`                                      | Inward push for hits near an element's edge, passed to `sampleImpulse` as `bias`.                                                                                                |
| `impulseFalloff(distance, forceDistance?)`                               | Exponential falloff used by `sampleImpulse`.                                                                                                                                     |
| `rectangle(width, height)`                                               | Rectangle polygon at the origin.                                                                                                                                                 |
| `seededRandom(seed)`                                                     | Deterministic `() => number` for repeatable patterns.                                                                                                                            |
| `area`, `center`, `contains`, `split`                                    | Convex polygon helpers.                                                                                                                                                          |
| `DEFAULT_FRACTURE_PARAMS`, `REFRACTURE_PARAMS`, `DEFAULT_IMPULSE_PARAMS` | Defaults. `REFRACTURE_PARAMS` is the coarser pattern used when a flying shard is hit again.                                                                                      |

### `@abeall/fracture`

| Export                          | Description                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `fracture(element, options?)`   | Break an element on the shared page-wide stage. Resolves to a [`FractureResult`](#fractureresult).   |
| `strike(at, options?)`          | Break a flying shard or the painted element at a viewport point. Resolves `true` if something broke. |
| `getFractureStage()`            | The shared stage, created on demand.                                                                 |
| `createFractureStage(options?)` | A separate stage with its own [`StageOptions`](#stageoptions). Each stage owns a WebGL canvas.       |
| `DEFAULT_*_PARAMS`, param types | Re-exported from the algorithm, plus `DEFAULT_MOTION_PARAMS` and `DEFAULT_BLUR_PARAMS`.              |

#### `FractureElementOptions`

| Option     | Default        | Description                                                                                                                           |
| ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `at`       | element center | Impact point in viewport coordinates: `{ x, y }` or a mouse/pointer event. Keyboard-triggered clicks (`detail === 0`) use the center. |
| `hide`     | `true`         | Hide the original while its pieces fly.                                                                                               |
| `fracture` |                | Per-call `Partial<FractureParams>`.                                                                                                   |
| `impulse`  |                | Per-call `Partial<ImpulseParams>`.                                                                                                    |

`fracture()` rejects, and leaves the page untouched, if the element can't be
captured. That happens when it's off screen, already fractured, moves during
capture, or contains cross-origin images that taint the canvas.

#### `FractureResult`

| Property    | Description                                                        |
| ----------- | ------------------------------------------------------------------ |
| `element`   | The fractured element.                                             |
| `pieces`    | How many pieces it broke into.                                     |
| `settled`   | Promise that resolves when all of its pieces have left the screen. |
| `restore()` | Show the original element again; the pieces keep flying.           |

#### `FractureStage`

| Member                        | Description                                                                 |
| ----------------------------- | --------------------------------------------------------------------------- |
| `fracture(element, options?)` | As above, on this stage.                                                    |
| `strike(at, { target? })`     | Hit a shard at the point, or else fracture `target` / the element under it. |
| `idle()`                      | Resolves when nothing is flying and no capture is pending.                  |
| `timeScale`                   | Read/write simulation speed.                                                |
| `shardCount`, `disposed`      | Read-only state.                                                            |
| `clear()`                     | Remove all pieces now; hidden elements stay hidden.                         |
| `restore()`                   | Remove all pieces and show every hidden element.                            |
| `dispose()`                   | Restore, remove the canvas, and release the WebGL context.                  |

#### `StageOptions`

| Option       | Description                                                       |
| ------------ | ----------------------------------------------------------------- |
| `fracture`   | `Partial<FractureParams>` for elements.                           |
| `refracture` | `Partial<FractureParams>` when a flying shard is hit again.       |
| `impulse`    | `Partial<ImpulseParams>`.                                         |
| `motion`     | `Partial<MotionParams>`.                                          |
| `blur`       | `Partial<BlurParams>`, or `false` to draw pieces sharp (cheaper). |
| `zIndex`     | Overlay z-index (default `2147483647`).                           |
| `onFracture` | `(result) => void` after each element breaks.                     |
| `onIdle`     | `() => void` when the last piece leaves.                          |

### `@abeall/fracture/react`

| Export                           | Description                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useFracture(options?)`          | Returns stable `{ fracture(target, options?), strike(at, options?), restore(), stage() }`. `target` is an element or a ref; an empty ref resolves `null`. Without options it uses the shared stage, so pieces outlive the component. With `StageOptions` it owns a stage that is disposed after its pieces settle following unmount. `restore()` shows only the elements this hook hid. |
| `useFractureEasterEgg(options?)` | `installEasterEgg` while mounted and `enabled` (default `true`). Options are read when it enables; `onExit`/`onFracture` always call the latest render's callbacks.                                                                                                                                                                                                                     |

React (`>=18`) is an optional peer dependency; the other entries don't use it.

### `@abeall/fracture/easter-egg`

| Export                         | Description                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `installEasterEgg(options?)`   | Arms triggers and returns an uninstall function, which also ends an active session. Accepts `triggers` (default `["konami"]`), `signal`, and everything `fractureEverything` accepts. |
| `fractureEverything(options?)` | Start now. Resolves to a restore function. Repeated calls share one session.                                                                                                          |
| `KONAMI_CODE`                  | The key sequence for the `"konami"` trigger.                                                                                                                                          |

**Triggers**

| Trigger                                 | Fires when                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `"konami"`                              | ↑ ↑ ↓ ↓ ← → ← → B A                                                                                                    |
| `{ sequence: string }`                  | The phrase is typed anywhere. Case, spaces, and punctuation not in the phrase are ignored; a wrong letter restarts it. |
| `{ keys: "ctrl+shift+f" }`              | That exact shortcut is pressed (`ctrl`, `shift`, `alt`/`option`, `meta`/`cmd`).                                        |
| `{ clicks?: 5, target, within?: 2000 }` | `target` (element or selector) is clicked `clicks` times within `within` ms.                                           |
| `(activate) => cleanup?`                | Your code calls `activate()`.                                                                                          |

**`FractureEverythingOptions`**: all `StageOptions`, plus:

| Option          | Default                             | Description                                                                                                                                                                              |
| --------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hud`           | `true`                              | Running total shown after pieces settle. `{ message?: (count) => string, storageKey?: string \| null }`, or `false`. The total persists in `localStorage` unless `storageKey` is `null`. |
| `speedControls` | `{ step: 1.25, min: 0.01, max: 2 }` | `+`/`-` time-scale keys, or `false`.                                                                                                                                                     |
| `exitKeys`      | `["Escape"]`                        | Keys that end the session.                                                                                                                                                               |
| `cursor`        | `"crosshair"`                       | Page cursor while active, or `false`.                                                                                                                                                    |
| `onExit`        |                                     | Called when the session ends.                                                                                                                                                            |

While active: click or `F` (at the pointer) fractures, `Enter`/`Space`
fractures the focused control, `Tab` still moves focus, and other clicks are
swallowed so links and buttons don't fire.

### Params

#### `FractureParams`

| Param               | Default    | Description                                                     |
| ------------------- | ---------- | --------------------------------------------------------------- |
| `radialCracks`      | `18`       | Major cracks leaving the impact.                                |
| `radialVariation`   | `1.8`      | Log variation in spacing between major cracks; 0 is even.       |
| `generations`       | `9`        | Maximum subdivision depth.                                      |
| `branchProbability` | `0.72`     | Chance of another split near the local fragment size.           |
| `branchAngle`       | `1`        | Max cant of cross-cracks, radians.                              |
| `sizeVariation`     | `1.8`      | Log variation in local fragment size.                           |
| `coreAreaFraction`  | `0.000025` | Smallest characteristic fragment, as a fraction of the surface. |
| `outwardAreaGrowth` | `0.12`     | Fragment size growth with squared distance from the impact.     |
| `splitImbalance`    | `0.7`      | How off-center each split may be (0–1).                         |

#### `ImpulseParams`

| Param                                           | Default        | Description                                 |
| ----------------------------------------------- | -------------- | ------------------------------------------- |
| `forceDistance`                                 | `180`          | Pixels over which force falls to 1/e.       |
| `outwardSpeed`                                  | `1050`         | Outward speed, px/s, before falloff.        |
| `centerBiasStrength`                            | `1`            | Inward push for edge hits; 0 disables.      |
| `towardCameraSpeedMin` / `towardCameraSpeedMax` | `350` / `1400` | Speed toward the viewer.                    |
| `forceVariation`                                | `0.4`          | Per-piece strength variation (±40%).        |
| `directionVariation`                            | `0.35`         | Per-piece direction variation, ± radians.   |
| `spiralAmount`                                  | `0.38`         | Tangential force relative to outward force. |
| `spinMultiplier` / `spinVariation`              | `2` / `0.35`   | Spin strength and per-axis variation.       |

#### `MotionParams`

| Param            | Default | Description                                       |
| ---------------- | ------- | ------------------------------------------------- |
| `timeScale`      | `0.06`  | Simulation seconds per real second (the slow-mo). |
| `gravity`        | `760`   | px/s².                                            |
| `drag`           | `0.12`  | Exponential velocity decay per second.            |
| `maxSpeed`       | `2600`  | Speed cap, px/s.                                  |
| `maxSpin`        | `36`    | Spin cap, rad/s.                                  |
| `thicknessScale` | `0.5`   | Shard thickness multiplier.                       |
| `maxAge`         | `18`    | Simulation seconds before a piece is removed.     |
| `maxShards`      | `2400`  | Oldest pieces are dropped beyond this.            |

#### `BlurParams`

| Param             | Default | Description                                                           |
| ----------------- | ------- | --------------------------------------------------------------------- |
| `apertureRadius`  | `40`    | Virtual lens aperture; larger means shallower depth of field.         |
| `maxBlurRadius`   | `32`    | Max blur, CSS px.                                                     |
| `resolutionScale` | `0.5`   | Blur buffer resolution per CSS px.                                    |
| `kernelRadius`    | `5`     | Aperture sampling radius; larger means finer bokeh and more GPU work. |

## Notes

- Capture uses [html-to-image](https://github.com/bubkoo/html-to-image) and is
  subject to its limits: cross-origin images without CORS headers taint the
  canvas (the element is then left alone), and some fonts or pseudo-elements
  may render slightly differently.
- Only the visible part of an element is captured, clipped to the viewport and
  any scrolling ancestors.
- The overlay is `position: fixed` and enters the top layer as a popover, so
  pieces appear above native `<dialog>`s and other popovers.
- Pieces live in viewport space. Scrolling doesn't move them.
- The effect only changes presentation. The DOM, layout, and framework
  ownership stay intact; hidden elements are `inert` and `aria-hidden` until
  restored.
- The stage disposes itself if the WebGL context is lost or the page is hidden
  with `pagehide`, and restores everything when it does.

## Development

Requires Node 22 (see `.nvmrc`).

```sh
npm install
npm run dev          # http://127.0.0.1:4179/
npm test
npm run typecheck
npm run build        # dist/: ESM entries, types, fracture-anywhere.js
npm run build:extension  # dist-extension/ and fracture-anything-<version>.zip
npm run build:site   # site/: the GitHub Pages demo
```

`.github/workflows/pages.yml` deploys `site/` to GitHub Pages on pushes to
`main`. Enable Pages with source "GitHub Actions" in the repository settings.

To publish:

```sh
npm login            # as abeall
npm publish          # runs tests, builds, publishes @abeall/fracture publicly
```

## License

MIT
