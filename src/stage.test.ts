// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera, Scene } from "three";
import { createStage, resolvePoint } from "./stage";
import { captureSurface } from "./surface";
import type { FractureStage } from "./types";

const renderState = vi.hoisted(() => ({
  blur: [] as unknown[],
  scenes: [] as Scene[],
  dispose: vi.fn(),
}));
vi.mock("./renderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./renderer")>();
  return {
    ...actual,
    FractureRenderer: class {
      scene = new Scene();
      camera = new PerspectiveCamera(45, 1, 1, 4000);
      renderer = { domElement: document.createElement("canvas") };
      constructor(blur: unknown) {
        renderState.blur.push(blur);
        renderState.scenes.push(this.scene);
        this.camera.position.set(innerWidth / 2, -innerHeight / 2, 1000);
        this.camera.updateMatrixWorld();
      }
      draw() {}
      resize() {}
      dispose() {
        renderState.dispose();
        this.renderer.domElement.remove();
      }
    },
  };
});
vi.mock("./surface", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./surface")>()),
  captureSurface: vi.fn(),
}));

function snapshot() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 40;
  return {
    canvas,
    width: 40,
    height: 40,
    left: 0,
    top: 0,
    pixels: new Uint8ClampedArray(40 * 40 * 4).fill(255),
  };
}
function step(now: number) {
  vi.mocked(requestAnimationFrame).mock.lastCall?.[0](now);
}
const scene = () => renderState.scenes.at(-1)!;
/** Send every piece past the camera so the next frame removes it. */
function finish() {
  scene().children.forEach((mesh) => (mesh.position.z = 1000));
  step(5000);
}

let stage: FractureStage | undefined;
beforeEach(() => {
  document.body.innerHTML = '<div id="modal">Modal</div><p id="other">x</p>';
  renderState.blur.length = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.mocked(captureSurface).mockResolvedValue(snapshot());
});
afterEach(() => {
  stage?.dispose();
  stage = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("fracture stage", () => {
  it("passes blur options to the renderer", () => {
    stage = createStage({ blur: false });
    expect(renderState.blur).toEqual([false]);
    stage.dispose();
    stage = createStage({ blur: { maxBlurRadius: 8 } });
    expect(renderState.blur[1]).toMatchObject({
      maxBlurRadius: 8,
      apertureRadius: 40,
    });
  });

  it("fractures a specific element, reports it, and settles when its pieces leave", async () => {
    const onFracture = vi.fn();
    const onIdle = vi.fn();
    stage = createStage({ onFracture, onIdle });
    const modal = document.getElementById("modal")!;
    const result = await stage.fracture(modal, { at: { x: 20, y: 20 } });
    expect(result.element).toBe(modal);
    expect(result.pieces).toBeGreaterThan(1);
    expect(stage.shardCount).toBe(result.pieces);
    expect(scene().children).toHaveLength(result.pieces);
    expect(modal.hasAttribute("inert")).toBe(true);
    expect(onFracture).toHaveBeenCalledWith(result);
    let settled = false;
    void result.settled.then(() => (settled = true));
    const idle = stage.idle();
    step(1000);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(onIdle).not.toHaveBeenCalled();
    finish();
    await idle;
    await result.settled;
    expect(settled).toBe(true);
    expect(onIdle).toHaveBeenCalledOnce();
    expect(stage.shardCount).toBe(0);
    // Hidden elements stay hidden until restored.
    expect(modal.hasAttribute("inert")).toBe(true);
    result.restore();
    expect(modal.hasAttribute("inert")).toBe(false);
    await stage.idle();
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it("can leave the original visible and accepts per-call params", async () => {
    stage = createStage();
    const modal = document.getElementById("modal")!;
    const coarse = await stage.fracture(modal, {
      hide: false,
      fracture: { radialCracks: 3, generations: 0 },
    });
    expect(modal.hasAttribute("inert")).toBe(false);
    const fine = await stage.fracture(document.getElementById("other")!);
    expect(coarse.pieces).toBeLessThanOrEqual(7);
    expect(fine.pieces).toBeGreaterThan(coarse.pieces);
  });

  it("rejects without hiding when capture fails or the element is already broken", async () => {
    stage = createStage();
    const modal = document.getElementById("modal")!;
    vi.mocked(captureSurface).mockRejectedValueOnce(new Error("Tainted"));
    await expect(stage.fracture(modal)).rejects.toThrow("Tainted");
    expect(modal.hasAttribute("inert")).toBe(false);
    expect(stage.shardCount).toBe(0);
    await stage.fracture(modal);
    await expect(stage.fracture(modal)).rejects.toThrow("already fractured");
  });

  it("clears pieces, restores everything, and disposes once", async () => {
    stage = createStage();
    const modal = document.getElementById("modal")!;
    const other = document.getElementById("other")!;
    const result = await stage.fracture(modal);
    await stage.fracture(other);
    stage.clear();
    await result.settled;
    expect(stage.shardCount).toBe(0);
    expect(modal.hasAttribute("inert")).toBe(true);
    stage.restore();
    expect(modal.hasAttribute("inert")).toBe(false);
    expect(other.hasAttribute("inert")).toBe(false);
    await stage.fracture(modal);
    stage.dispose();
    stage.dispose();
    expect(stage.disposed).toBe(true);
    expect(modal.hasAttribute("inert")).toBe(false);
    expect(renderState.dispose).toHaveBeenCalledOnce();
    expect(document.querySelector("canvas")).toBeNull();
    await expect(stage.fracture(modal)).rejects.toThrow("disposed");
    await expect(stage.strike({ x: 1, y: 1 })).resolves.toBe(false);
  });

  it("applies the time scale to the simulation", async () => {
    stage = createStage({ motion: { gravity: 0, drag: 0 } });
    await stage.fracture(document.getElementById("modal")!);
    const mesh = scene().children[0]!;
    const shard = mesh.userData.shard as { age: number };
    stage.timeScale = 0.5;
    step(1000);
    step(1040);
    expect(shard.age).toBeCloseTo(0.02);
  });
});

describe("impact points", () => {
  it("accepts points and pointer events, centering keyboard clicks", () => {
    const element = document.createElement("div");
    element.getBoundingClientRect = () => new DOMRect(10, 20, 100, 50);
    expect(resolvePoint({ x: 3, y: 4 }, element)).toEqual({ x: 3, y: 4 });
    expect(
      resolvePoint({ clientX: 7, clientY: 8, detail: 1 }, element),
    ).toEqual({ x: 7, y: 8 });
    expect(
      resolvePoint({ clientX: 0, clientY: 0, detail: 0 }, element),
    ).toEqual({ x: 60, y: 45 });
    expect(resolvePoint(undefined, element)).toEqual({ x: 60, y: 45 });
  });
});
