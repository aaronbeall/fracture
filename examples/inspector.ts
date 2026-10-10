// Development-only rig. Import the production algorithm instead of maintaining a preview copy.
import {
  area,
  center,
  contains,
  fracture,
  type Point,
  type Polygon,
} from "../src/fracture";
import { impactBias, sampleImpulse } from "../src/impulse";
import { DEFAULT_FRACTURE_PARAMS, DEFAULT_IMPULSE_PARAMS } from "../src/params";
import { DEFAULT_MOTION_PARAMS as FRACTURE_TUNING } from "../src/params";

const tuning = {
  ...DEFAULT_FRACTURE_PARAMS,
  ...DEFAULT_IMPULSE_PARAMS,
  ...FRACTURE_TUNING,
};

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing inspector element: ${selector}`);
  return found;
}

const sample = element<HTMLButtonElement>("#sample");
const pattern = element<SVGSVGElement>("#pattern");
const seed = element<HTMLInputElement>("#seed");
const size = element<HTMLSelectElement>("#size");
const heatmap = element<HTMLInputElement>("#heatmap");
const slider = element<HTMLInputElement>("#piece");
const summary = element<HTMLOutputElement>("#summary");
const details = element<HTMLOutputElement>("#details");
const namespace = "http://www.w3.org/2000/svg";

interface Fragment {
  polygon: Polygon;
  speed: number;
  velocity: ReturnType<typeof sampleImpulse>["velocity"];
  distance: number;
  area: number;
  node: SVGPolygonElement;
}

let impact: Point | null = null; // Normalized coordinates preserve the click on resize.
let fragments: Fragment[] = [];
let selected: SVGPolygonElement | undefined;

// One stream per click: fracture first, then one impulse per fragment, as in the effect.
function random(seedValue: number) {
  let state = seedValue >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const colors = [
  [37, 76, 152],
  [25, 185, 190],
  [245, 212, 77],
  [244, 119, 48],
  [202, 41, 65],
];
function color(speed: number) {
  const position =
    Math.max(0, Math.min(1, speed / tuning.maxSpeed)) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(position));
  const low = colors[index]!;
  const high = colors[index + 1]!;
  return `rgb(${low.map((value, channel) => Math.round(value + (high[channel]! - value) * (position - index))).join(",")})`;
}

function inspect(index: number) {
  const piece = fragments[index];
  if (!piece) return;
  selected?.classList.remove("selected");
  selected = piece.node;
  selected.classList.add("selected");
  slider.value = String(index + 1);
  slider.setAttribute(
    "aria-valuetext",
    `Piece ${index + 1} of ${fragments.length}, speed ${Math.round(piece.speed)} pixels per second`,
  );
  const v = piece.velocity;
  details.textContent = `Piece ${index + 1} / ${fragments.length} · ${piece.area.toFixed(1)} px² · ${piece.distance.toFixed(1)} px from impact\nSpeed ${piece.speed.toFixed(1)} px/s · vx ${v.x.toFixed(1)} · vy ${v.y.toFixed(1)} · vz ${v.z.toFixed(1)}`;
}

function paint() {
  for (const piece of fragments) {
    const forceColor = color(piece.speed);
    piece.node.setAttribute("fill", heatmap.checked ? forceColor : "none");
    piece.node.setAttribute("stroke", heatmap.checked ? "#10283f" : forceColor);
  }
}

function draw() {
  if (!impact || !seed.validity.valid || seed.value === "") return;
  const { width, height } = sample.getBoundingClientRect();
  const hit = { x: impact.x * width, y: impact.y * height };
  const bias = impactBias(hit, width, height);
  const source: Polygon = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const rng = random(seed.valueAsNumber);
  const pieces = fracture(source, hit, { random: rng });
  const nodes = document.createDocumentFragment();
  selected = undefined;
  fragments = pieces.map((polygon) => {
    const c = center(polygon);
    const delta = { x: c.x - hit.x, y: c.y - hit.y };
    // The original DOM plane maps 1:1 to screen pixels, just like the initial runtime blast.
    const { velocity } = sampleImpulse(delta.x, delta.y, {
      random: rng,
      bias,
    });
    const rawSpeed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const speed = Math.min(rawSpeed, tuning.maxSpeed);
    const scale = rawSpeed > 0 ? speed / rawSpeed : 0;
    const node = document.createElementNS(namespace, "polygon");
    node.setAttribute("points", polygon.map((p) => `${p.x},${p.y}`).join(" "));
    nodes.append(node);
    return {
      polygon,
      node,
      speed,
      area: area(polygon),
      distance: Math.hypot(delta.x, delta.y),
      velocity: {
        x: velocity.x * scale,
        y: velocity.y * scale,
        z: velocity.z * scale,
      },
    };
  });
  paint();
  const marker = document.createElementNS(namespace, "path");
  marker.setAttribute(
    "d",
    `M${hit.x - 9},${hit.y}h18 M${hit.x},${hit.y - 9}v18`,
  );
  marker.setAttribute("stroke", "white");
  marker.setAttribute("stroke-width", "2");
  marker.setAttribute("pointer-events", "none");
  nodes.append(marker);
  const biasLength = Math.hypot(bias.x, bias.y);
  if (biasLength > 0.001 && tuning.centerBiasStrength > 0) {
    const tip = {
      x: hit.x + bias.x * tuning.centerBiasStrength * 60,
      y: hit.y + bias.y * tuning.centerBiasStrength * 60,
    };
    const ux = bias.x / biasLength;
    const uy = bias.y / biasLength;
    // White halo keeps the shared-bias arrow legible over every heat-map color.
    for (const [stroke, width] of [
      ["white", "5"],
      ["#10283f", "2"],
    ]) {
      const arrow = document.createElementNS(namespace, "path");
      arrow.setAttribute(
        "d",
        `M${hit.x},${hit.y}L${tip.x},${tip.y} M${tip.x - ux * 8 - uy * 5},${tip.y - uy * 8 + ux * 5}L${tip.x},${tip.y}L${tip.x - ux * 8 + uy * 5},${tip.y - uy * 8 - ux * 5}`,
      );
      arrow.setAttribute("fill", "none");
      arrow.setAttribute("stroke", stroke!);
      arrow.setAttribute("stroke-width", width!);
      arrow.setAttribute("pointer-events", "none");
      arrow.setAttribute("data-bias-arrow", "");
      nodes.append(arrow);
    }
  }
  pattern.setAttribute("viewBox", `0 0 ${width} ${height}`);
  pattern.replaceChildren(nodes);
  sample.classList.add("has-pattern");
  slider.disabled = false;
  slider.max = String(fragments.length);
  const speeds = fragments.map((piece) => piece.speed);
  const biasLabel = [
    Math.abs(bias.x) > 0.001
      ? `${bias.x < 0 ? "left" : "right"} ${Math.round(Math.abs(bias.x) * tuning.centerBiasStrength * 100)}%`
      : "",
    Math.abs(bias.y) > 0.001
      ? `${bias.y < 0 ? "up" : "down"} ${Math.round(Math.abs(bias.y) * tuning.centerBiasStrength * 100)}%`
      : "",
  ]
    .filter(Boolean)
    .join(", ");
  summary.textContent = `${fragments.length} pieces · ${Math.round(width)} × ${Math.round(height)} px · impact (${Math.round(hit.x)}, ${Math.round(hit.y)}) · speed ${Math.round(Math.min(...speeds))}–${Math.round(Math.max(...speeds))} px/s · seed ${seed.value} · shared bias: ${tuning.centerBiasStrength > 0 && biasLabel ? biasLabel : "none"}`;
  inspect(Math.min(Number(slider.value) - 1, fragments.length - 1));
}

sample.addEventListener("click", (event) => {
  const rect = sample.getBoundingClientRect();
  impact =
    event.detail === 0
      ? (impact ?? { x: 0.5, y: 0.5 })
      : {
          x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
          y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
        };
  draw();
});
sample.addEventListener("keydown", (event) => {
  if (
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return;
  event.preventDefault();
  const { width, height } = sample.getBoundingClientRect();
  impact ??= { x: 0.5, y: 0.5 };
  const step = event.shiftKey ? 50 : 10;
  impact.x = Math.max(
    0,
    Math.min(
      1,
      impact.x +
        (event.key === "ArrowLeft"
          ? -step
          : event.key === "ArrowRight"
            ? step
            : 0) /
          width,
    ),
  );
  impact.y = Math.max(
    0,
    Math.min(
      1,
      impact.y +
        (event.key === "ArrowUp"
          ? -step
          : event.key === "ArrowDown"
            ? step
            : 0) /
          height,
    ),
  );
  draw();
});
sample.addEventListener("pointermove", (event) => {
  if (!fragments.length) return;
  const rect = sample.getBoundingClientRect();
  const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const index = fragments.findIndex((piece) => contains(piece.polygon, point));
  if (index >= 0) inspect(index);
});
slider.addEventListener("input", () => inspect(Number(slider.value) - 1));
heatmap.addEventListener("change", paint);
seed.addEventListener("input", draw);
size.addEventListener("change", () => {
  const [width, height] = size.value.split(",");
  sample.style.setProperty("--sample-width", `${width}px`);
  sample.style.setProperty("--sample-height", `${height}px`);
  draw();
});
element("#new-seed").addEventListener("click", () => {
  seed.value = String((Number(seed.value) + 1) >>> 0);
  impact ??= { x: 0.5, y: 0.5 };
  draw();
});
element("#clear").addEventListener("click", () => {
  impact = null;
  fragments = [];
  selected = undefined;
  pattern.replaceChildren();
  sample.classList.remove("has-pattern");
  slider.disabled = true;
  slider.value = slider.max = "1";
  slider.removeAttribute("aria-valuetext");
  summary.textContent = "Ready. Each click replaces the previous pattern.";
  details.textContent = "Click the sample to inspect pieces.";
});
new ResizeObserver(draw).observe(sample);
element("#legend-mid").textContent = String(tuning.maxSpeed / 2);
element("#legend-max").textContent = `${tuning.maxSpeed} px/s · strong`;
element("#tuning").textContent = JSON.stringify(tuning, null, 2);
