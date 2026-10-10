import { toCanvas } from "html-to-image";
import type { Point } from "./fracture";

export const hiddenAttribute = "data-fracture-hidden";
export const overlayAttribute = "data-fracture-overlay";

function painted(color: string): boolean {
  return (
    color !== "" &&
    color !== "transparent" &&
    !/rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(color) &&
    !/\/\s*0(?:\.0+)?\s*\)$/.test(color)
  );
}

/** Choose the nearest painted surface, skipping layout-only wrappers and the page root. */
export function findSurface(
  start: Element | null,
): HTMLElement | SVGSVGElement | null {
  for (
    let node = start;
    node && node !== document.body && node !== document.documentElement;
    node = node.parentElement
  ) {
    if (node.closest(`[${hiddenAttribute}], [${overlayAttribute}]`))
      return null;
    const style = getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    )
      continue;
    if (node instanceof SVGElement) {
      const svg = node instanceof SVGSVGElement ? node : node.ownerSVGElement;
      if (svg && svg.getBoundingClientRect().width > 0) return svg;
    }
    if (!(node instanceof HTMLElement)) continue;
    const box = node.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    if (
      /^(IMG|CANVAS|VIDEO|INPUT|SELECT|TEXTAREA|BUTTON|HR)$/.test(node.tagName)
    )
      return node;
    if (
      painted(style.backgroundColor) ||
      (style.backgroundImage && style.backgroundImage !== "none") ||
      (style.boxShadow && style.boxShadow !== "none") ||
      (parseFloat(style.outlineWidth) > 0 &&
        style.outlineStyle !== "none" &&
        painted(style.outlineColor))
    )
      return node;
    if (
      ["top", "right", "bottom", "left"].some((side) => {
        return (
          parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 &&
          painted(style.getPropertyValue(`border-${side}-color`)) &&
          style.getPropertyValue(`border-${side}-style`) !== "none"
        );
      })
    )
      return node;
    // Text is painted content too; descendant text alone does not make a wrapper a surface.
    if (
      Array.from(node.childNodes).some(
        (child) =>
          child.nodeType === Node.TEXT_NODE && child.textContent?.trim(),
      )
    )
      return node;
    if (
      ["::before", "::after"].some((pseudo) => {
        const content = getComputedStyle(node, pseudo).content;
        return (
          content &&
          content !== "none" &&
          content !== "normal" &&
          content !== '""'
        );
      })
    )
      return node;
  }
  return null;
}

export interface Snapshot {
  canvas: HTMLCanvasElement;
  left: number;
  top: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

/** Capture only what is visible, keeping texture size bounded even for long pages. */
export async function captureSurface(
  element: HTMLElement | SVGSVGElement,
): Promise<Snapshot> {
  const bounds = element.getBoundingClientRect();
  let left = Math.max(0, bounds.left);
  let top = Math.max(0, bounds.top);
  let right = Math.min(innerWidth, bounds.right);
  let bottom = Math.min(innerHeight, bounds.bottom);
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent);
    const rect = parent.getBoundingClientRect();
    if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) {
      left = Math.max(left, rect.left);
      right = Math.min(right, rect.right);
    }
    if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) {
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
  }
  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1)
    throw new Error("Surface is outside the viewport");
  const ratio = Math.min(
    devicePixelRatio || 1,
    2,
    2048 / Math.max(bounds.width, bounds.height),
  );
  // html-to-image's implementation handles SVG nodes, but its public type only accepts HTMLElement.
  const image = await toCanvas(element as HTMLElement, {
    width: bounds.width,
    height: bounds.height,
    pixelRatio: ratio,
    preferredFontFormat: "woff2",
    filter: (node) =>
      !(node instanceof Element) || !node.hasAttribute(hiddenAttribute),
    style: {
      transform: "none",
      margin: "0",
      position: "static",
      inset: "auto",
    },
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * ratio));
  canvas.height = Math.max(1, Math.ceil(height * ratio));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas capture is unavailable");
  ctx.drawImage(
    image,
    ((left - bounds.left) * image.width) / bounds.width,
    ((top - bounds.top) * image.height) / bounds.height,
    (width * image.width) / bounds.width,
    (height * image.height) / bounds.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  // This also detects tainted images before the real DOM is hidden.
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  if (!pixels.some((value, i) => i % 4 === 3 && value > 8))
    throw new Error("Surface capture is empty");
  return { canvas, left, top, width, height, pixels };
}

export function opaqueAt(snapshot: Snapshot, point: Point): boolean {
  const x = Math.min(
    snapshot.canvas.width - 1,
    Math.max(0, Math.floor((point.x / snapshot.width) * snapshot.canvas.width)),
  );
  const y = Math.min(
    snapshot.canvas.height - 1,
    Math.max(
      0,
      Math.floor((point.y / snapshot.height) * snapshot.canvas.height),
    ),
  );
  return (snapshot.pixels[(y * snapshot.canvas.width + x) * 4 + 3] ?? 0) > 20;
}

/** Preserve layout and React ownership while removing hidden controls from interaction and AT. */
export function hideSurface(element: Element): () => void {
  const attributes = [hiddenAttribute, "inert", "aria-hidden"].map(
    (name) => [name, element.getAttribute(name)] as const,
  );
  element.setAttribute(hiddenAttribute, "");
  element.setAttribute("inert", "");
  element.setAttribute("aria-hidden", "true");
  return () =>
    attributes.forEach(([name, value]) =>
      value === null
        ? element.removeAttribute(name)
        : element.setAttribute(name, value),
    );
}
