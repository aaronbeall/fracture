# Fracture

A transparent WebGL overlay that turns DOM surfaces into textured, rotating
fragments. Clicks fracture the surface or shard you hit; unrelated fragments keep
their existing motion. Escape restores the page.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:4179/examples/ for the playground, fracture inspector, and
React keyboard-trigger example. Serve examples through Vite; file URLs cannot
load TypeScript modules.

## Plain JavaScript / TypeScript

```ts
import { setupFracture } from "@aaronbeall/fracture";

const restore = await setupFracture();
// Later, or let the user press Escape:
restore();
```

The entry loads Three.js and DOM capture only when activated. An optional
`AbortSignal` cancels pending activation and restores an active session:

```ts
const controller = new AbortController();
await setupFracture({ signal: controller.signal });
controller.abort();
```

## React

```tsx
import { useFracture } from "@aaronbeall/fracture/react";

function App() {
  useFracture({ enabled: import.meta.env.DEV });
  return <YourApp />;
}
```

While enabled, type **ya done messed up aaron!** anywhere in the page. Matching is
case insensitive, spaces and punctuation are ignored except `!`, and an
out-of-order letter resets the sequence. A-A-Ron and Aaron both work. The final
exclamation point is required. Modified shortcuts, IME composition, and key
repeat are ignored. Typing retains its normal behavior. Disabling or unmounting
removes the listener, cancels pending activation, and restores an active effect.

React is an optional peer dependency; the plain entry does not depend on it.

## Controls and tuning

- Click a painted element or flying shard to fracture it.
- `+` / `-` adjust simulation speed immediately after activation.
- Tab to a control and press Enter or Space to fracture it; `F` fires at the pointer.
- Escape restores the page. Mouse holding adds no force.

`FRACTURE_TUNING` in `src/tuning.ts` controls geometry, force, spin, speed, and
depth blur. The source inspector uses the same fracture and impulse functions as
the runtime. The small HUD persists a successful element-destruction count in
local storage; it falls back to a session tally if storage is unavailable.

Capture uses html-to-image and is subject to browser image/font/canvas origin
restrictions. The effect changes presentation only and preserves layout and DOM
ownership. Depth blur approximates defocus from the visible color/depth buffers.

## Build and validation

```sh
npm test
npm run typecheck
npm run build
npm pack --dry-run
```

The build produces ESM and TypeScript declarations in `dist/`. Three.js and
html-to-image remain package dependencies. Only `dist/` and package metadata are
included when packing; examples and tests stay in this source project.
