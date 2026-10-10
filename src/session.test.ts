// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PerspectiveCamera, Scene, Vector3 } from "three";
import { setup } from "./runtime";
import { captureSurface } from "./surface";
import { FRACTURE_TUNING as tuning } from "./tuning";
import { area, center, type Polygon } from "./fracture";
import { impactBias, sampleImpulse } from "./impulse";
import { destroyedCountKey } from "./hud";

const renderState = vi.hoisted(() => ({
  constructors: vi.fn(),
  draw: vi.fn(),
  dispose: vi.fn(),
  scenes: [] as Scene[],
}));
vi.mock("./renderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./renderer")>();
  return {
    ...actual,
    FractureRenderer: class {
      scene = new Scene();
      camera = new PerspectiveCamera(45, 1, 1, 4000);
      renderer = { domElement: document.createElement("canvas") };
      constructor() {
        renderState.constructors();
        renderState.scenes.push(this.scene);
        this.camera.aspect = innerWidth / innerHeight;
        this.camera.fov = (2 * Math.atan(innerHeight / 2000) * 180) / Math.PI;
        this.camera.position.set(innerWidth / 2, -innerHeight / 2, 1000);
        this.camera.updateProjectionMatrix();
        this.camera.updateMatrixWorld();
      }
      draw = renderState.draw;
      resize() {}
      dispose() {
        renderState.dispose();
        this.renderer.domElement.remove();
      }
    },
  };
});
vi.mock("./surface", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./surface")>();
  return {
    ...actual,
    captureSurface: vi.fn(),
    findSurface: (element: Element) => element,
  };
});

let dispose: (() => void) | undefined;
function snapshot() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 20;
  return {
    canvas,
    width: 20,
    height: 20,
    left: 0,
    top: 0,
    pixels: new Uint8ClampedArray(1600).fill(255),
  };
}
function click(element: Element) {
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
      detail: 1,
    }),
  );
}

function key(key: string, init: KeyboardEventInit = {}, type = "keydown") {
  const event = new KeyboardEvent(type, {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.dispatchEvent(event);
  return event;
}

function step(now: number) {
  const callback = vi.mocked(requestAnimationFrame).mock.lastCall?.[0];
  if (!callback) throw new Error("Expected a scheduled simulation frame");
  callback(now);
}

async function firstShard() {
  const target = document.getElementById("target");
  if (!target) throw new Error("Missing target");
  click(target);
  await vi.waitFor(() => expect(target.hasAttribute("inert")).toBe(true));
  const scene = renderState.scenes[renderState.scenes.length - 1];
  const shard = scene?.children[0]?.userData.shard as
    | { age: number; velocity: Vector3 }
    | undefined;
  if (!shard) throw new Error("Expected a rendered shard");
  step(1000);
  return shard;
}

function pointer(type: string, init: MouseEventInit = {}) {
  window.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: -200,
      clientY: 0,
      ...init,
    }),
  );
}

function motion() {
  const scene = renderState.scenes[renderState.scenes.length - 1];
  if (!scene) throw new Error("Missing scene");
  return scene.children.map((mesh) => {
    const shard = mesh.userData.shard as {
      velocity: Vector3;
      spin: Vector3;
      generation: number;
      polygon: Polygon;
    };
    return {
      mesh,
      shard,
      velocity: shard.velocity.clone(),
      spin: shard.spin.clone(),
    };
  });
}

function expectUnchanged(states: ReturnType<typeof motion>) {
  for (const { shard, velocity, spin } of states) {
    expect(shard.velocity.toArray()).toEqual(velocity.toArray());
    expect(shard.spin.toArray()).toEqual(spin.toArray());
  }
}

beforeEach(() => {
  document.body.innerHTML =
    '<button id="target">Shatter</button><button id="next">Next</button>';
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.mocked(captureSurface).mockResolvedValue(snapshot());
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("lazy session lifecycle", () => {
  it("uses the original element bounds for the bias of every new shard", async () => {
    const captured = snapshot();
    Object.assign(captured, { left: 100, top: 80, width: 200, height: 100 });
    vi.mocked(captureSurface).mockResolvedValue(captured);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    dispose = setup();
    const target = document.getElementById("target")!;
    target.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        detail: 1,
        clientX: 280,
        clientY: 160,
      }),
    );
    await vi.waitFor(() => expect(target.hasAttribute("inert")).toBe(true));
    const scene = renderState.scenes[renderState.scenes.length - 1]!;
    expect(scene.children.length).toBeGreaterThan(1);
    const bias = impactBias({ x: 180, y: 80 }, 200, 100);
    for (const child of scene.children) {
      const shard = child.userData.shard as {
        polygon: Polygon;
        velocity: Vector3;
      };
      const c = center(shard.polygon);
      const impulse = sampleImpulse(c.x - 180, c.y - 80, () => 0.5, bias);
      const expected = new Vector3(
        impulse.velocity.x,
        impulse.velocity.y,
        impulse.velocity.z,
      ).clampLength(0, tuning.maxSpeed);
      expect(shard.velocity.distanceTo(expected)).toBeLessThan(1e-8);
    }
  });

  it("fractures only the hit shard and leaves all siblings' motion unchanged", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const captured = snapshot();
    captured.width = captured.canvas.width = 300;
    captured.height = captured.canvas.height = 200;
    captured.pixels = new Uint8ClampedArray(300 * 200 * 4).fill(255);
    vi.mocked(captureSurface).mockResolvedValue(captured);
    dispose = setup();
    const target = document.getElementById("target");
    if (!target) throw new Error("Missing target");
    click(target);
    await vi.waitFor(() => expect(target.hasAttribute("inert")).toBe(true));
    const scene = renderState.scenes[renderState.scenes.length - 1];
    if (!scene) throw new Error("Missing scene");
    const before = scene.children.length;
    const previousMotion = motion();
    document.body.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: 250,
        clientY: 160,
        detail: 1,
      }),
    );
    expect(scene.children.length).toBeGreaterThan(before);
    const removed = previousMotion.filter(
      ({ mesh }) => !scene.children.includes(mesh),
    );
    expect(removed).toHaveLength(1);
    expectUnchanged(
      previousMotion.filter(({ mesh }) => scene.children.includes(mesh)),
    );
    const children = motion().filter(
      ({ mesh }) => !previousMotion.some((state) => state.mesh === mesh),
    );
    expect(children.length).toBeGreaterThan(1);
    expect(children.every(({ shard }) => shard.generation === 1)).toBe(true);
    expect(children.some(({ spin }) => !spin.equals(removed[0]!.spin))).toBe(
      true,
    );
    expect(captureSurface).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(destroyedCountKey)).toBe("1");
  });

  it("shatters a new DOM element without changing pieces already in flight", async () => {
    dispose = setup();
    await firstShard();
    const before = motion();
    const captured = snapshot();
    captured.left = 200;
    vi.mocked(captureSurface).mockResolvedValue(captured);
    const next = document.getElementById("next")!;
    next.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        detail: 1,
        clientX: 210,
        clientY: 10,
      }),
    );
    await vi.waitFor(() => expect(next.hasAttribute("inert")).toBe(true));
    expectUnchanged(before);
    const fresh = motion().filter(
      ({ mesh }) => !before.some((state) => state.mesh === mesh),
    );
    expect(fresh.length).toBeGreaterThan(0);
    expect(fresh.every(({ velocity }) => velocity.length() > 0)).toBe(true);
    expect(captureSurface).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(destroyedCountKey)).toBe("2");
  });

  it("does not apply force or restart animation when an empty area is clicked", async () => {
    dispose = setup();
    await firstShard();
    const before = motion();
    const frames = vi.mocked(requestAnimationFrame).mock.calls.length;
    window.dispatchEvent(
      new MouseEvent("click", {
        cancelable: true,
        detail: 1,
        clientX: 800,
        clientY: 600,
      }),
    );
    expectUnchanged(before);
    expect(motion()).toHaveLength(before.length);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(frames);
    expect(captureSurface).toHaveBeenCalledOnce();
  });

  it("applies force only to the hit shard when it cannot subdivide further", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const captured = snapshot();
    captured.width = captured.canvas.width = 300;
    captured.height = captured.canvas.height = 200;
    captured.pixels = new Uint8ClampedArray(300 * 200 * 4).fill(255);
    vi.mocked(captureSurface).mockResolvedValue(captured);
    dispose = setup();
    await firstShard();
    const before = motion();
    // Use a broad fragment so integer mouse coordinates stay inside its face.
    const hit = [...before].sort(
      (a, b) => area(b.shard.polygon) - area(a.shard.polygon),
    )[0]!;
    hit.shard.generation = 5;
    window.dispatchEvent(
      new MouseEvent("click", {
        cancelable: true,
        detail: 1,
        clientX: hit.mesh.position.x,
        clientY: -hit.mesh.position.y,
      }),
    );
    expect(motion()).toHaveLength(before.length);
    expect(hit.shard.velocity.equals(hit.velocity)).toBe(false);
    expectUnchanged(before.filter((state) => state !== hit));
    expect(captureSurface).toHaveBeenCalledOnce();
  });

  it("does nothing on module import and sets up only one canvas and HUD", () => {
    expect(renderState.constructors).not.toHaveBeenCalled();
    expect(document.querySelector("[data-fracture-lens-overlay]")).toBeNull();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    dispose = setup();
    expect(setup()).toBe(dispose);
    expect(renderState.constructors).toHaveBeenCalledTimes(1);
    expect(
      document.querySelectorAll("[data-fracture-lens-overlay]"),
    ).toHaveLength(2);
    expect(document.querySelectorAll("[data-fracture-lens-hud]")).toHaveLength(
      1,
    );
    expect(
      document.querySelector("[data-fracture-lens-hud]")?.textContent,
    ).toBe("Fractured 0 times since A-A-ron done messed up.");
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("blocks the original action, hides captured controls, and restores their exact attributes", async () => {
    const target = document.getElementById("target");
    if (!target) throw new Error("Missing target");
    target.setAttribute("aria-hidden", "false");
    target.focus();
    const action = vi.fn();
    target.addEventListener("click", action);
    dispose = setup();
    click(target);
    await vi.waitFor(() =>
      expect(target.hasAttribute("data-fracture-lens-hidden")).toBe(true),
    );
    expect(action).not.toHaveBeenCalled();
    expect(target.hasAttribute("inert")).toBe(true);
    expect(target.getAttribute("aria-hidden")).toBe("true");
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(target.hasAttribute("inert")).toBe(false);
    expect(target.getAttribute("aria-hidden")).toBe("false");
    expect(target.hasAttribute("data-fracture-lens-hidden")).toBe(false);
    expect(document.querySelector("[data-fracture-lens-overlay]")).toBeNull();
    expect(document.activeElement).toBe(target);
    click(target);
    expect(action).toHaveBeenCalledOnce();
    dispose();
    expect(renderState.dispose).toHaveBeenCalledOnce();
  });

  it("does not hide a surface if capture fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(captureSurface).mockRejectedValue(new Error("Tainted canvas"));
    dispose = setup();
    click(document.body);
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());
    expect(document.querySelector("[data-fracture-lens-hidden]")).toBeNull();
    expect(localStorage.getItem(destroyedCountKey)).toBeNull();
  });

  it("cancels a capture that finishes after Escape", async () => {
    let resolve: ((value: ReturnType<typeof snapshot>) => void) | undefined;
    vi.mocked(captureSurface).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    dispose = setup();
    click(document.body);
    dispose();
    resolve?.(snapshot());
    await Promise.resolve();
    expect(document.querySelector("[data-fracture-lens-hidden]")).toBeNull();
    expect(renderState.draw).not.toHaveBeenCalled();
    expect(localStorage.getItem(destroyedCountKey)).toBeNull();
  });

  it("shatters once for Enter/Space, suppresses repeats, and leaves Tab native", async () => {
    const target = document.getElementById("target");
    if (!target) throw new Error("Missing target");
    target.focus();
    dispose = setup();
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
        cancelable: true,
      }),
    );
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: " ",
        repeat: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await vi.waitFor(() => expect(target.hasAttribute("inert")).toBe(true));
    expect(captureSurface).toHaveBeenCalledTimes(1);
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });

  it("changes speed immediately without adding HUD text, preserves zoom shortcuts, and resets speed on cleanup", async () => {
    dispose = setup();
    expect(key("+").defaultPrevented).toBe(true);
    expect(
      document.querySelector("[data-fracture-lens-hud] output")?.textContent,
    ).toBe("Fractured 0 times since A-A-ron done messed up.");
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    const shard = await firstShard();
    const baseStep = 0.02 * tuning.timeScale * tuning.timeScaleStep;
    step(1020);
    expect(shard.age).toBeCloseTo(baseStep);
    expect(key("+").defaultPrevented).toBe(true);
    step(1040);
    expect(shard.age).toBeCloseTo(baseStep * (1 + tuning.timeScaleStep));
    expect(key("-", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key("+", { metaKey: true }).defaultPrevented).toBe(false);
    key("-");
    step(1060);
    expect(shard.age).toBeCloseTo(baseStep * (2 + tuning.timeScaleStep));
    key("=");
    for (let i = 0; i < 100; i++) key("+", { repeat: true });
    let before = shard.age;
    step(1080);
    expect(shard.age - before).toBeCloseTo(0.02 * tuning.maxTimeScale);
    for (let i = 0; i < 100; i++) key("-", { repeat: true });
    before = shard.age;
    step(1100);
    expect(shard.age - before).toBeCloseTo(0.02 * tuning.minTimeScale);
    dispose();
    expect(key("+").defaultPrevented).toBe(false);
    dispose = setup();
    const fresh = await firstShard();
    step(1020);
    expect(fresh.age).toBeCloseTo(0.02 * tuning.timeScale);
  });

  it("persists each successful element destruction across activations while keeping focus", async () => {
    localStorage.setItem(destroyedCountKey, "7");
    const target = document.getElementById("target")!;
    target.focus();
    dispose = setup();
    const hud = document.querySelector<HTMLElement>(
      "[data-fracture-lens-hud]",
    )!;
    expect(hud.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(target);
    expect(
      document.querySelector("[data-fracture-lens-hud] output")?.textContent,
    ).toBe("Fractured 7 times since A-A-ron done messed up.");
    await firstShard();
    expect(localStorage.getItem(destroyedCountKey)).toBe("8");
    expect(
      document.querySelector("[data-fracture-lens-hud] output")?.textContent,
    ).toBe("Fractured 8 times since A-A-ron done messed up.");
    expect(hud.getAttribute("aria-hidden")).toBe("true");
    // Finish the flight through the normal simulation cleanup path.
    for (const mesh of renderState.scenes.at(-1)!.children)
      mesh.position.z = 1000;
    step(1020);
    expect(hud.hasAttribute("aria-hidden")).toBe(false);
    expect(hud.style.opacity).toBe("0.6");
    key("Escape");
    expect(document.querySelector("[data-fracture-lens-hud]")).toBeNull();
    expect(localStorage.getItem(destroyedCountKey)).toBe("8");
    dispose = setup();
    expect(
      document.querySelector("[data-fracture-lens-hud] output")?.textContent,
    ).toBe("Fractured 8 times since A-A-ron done messed up.");
    await firstShard();
    expect(localStorage.getItem(destroyedCountKey)).toBe("9");
  });

  it.each(["invalid", "-4", "1.5"])(
    "recovers from an invalid saved destruction count: %s",
    (stored) => {
      localStorage.setItem(destroyedCountKey, stored);
      dispose = setup();
      expect(
        document.querySelector("[data-fracture-lens-hud] output")?.textContent,
      ).toBe("Fractured 0 times since A-A-ron done messed up.");
    },
  );

  it("keeps the session tally usable when local storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    dispose = setup();
    await firstShard();
    expect(
      document.querySelector("[data-fracture-lens-hud] output")?.textContent,
    ).toBe("Fractured 1 times since A-A-ron done messed up.");
  });

  it("refreshes the HUD when another tab updates the stored count", () => {
    dispose = setup();
    localStorage.setItem(destroyedCountKey, "19");
    window.dispatchEvent(
      new StorageEvent("storage", { key: destroyedCountKey }),
    );
    expect(
      document.querySelector("[data-fracture-lens-hud] output")?.textContent,
    ).toBe("Fractured 19 times since A-A-ron done messed up.");
  });

  it("does not repel while the pointer is held or R is pressed", async () => {
    dispose = setup();
    const shard = await firstShard();
    shard.velocity.set(13, 17, 19);
    const expected = shard.velocity.clone();
    const dt = 0.02 * tuning.timeScale;
    pointer("pointerdown");
    expect(key("r").defaultPrevented).toBe(false);
    for (const now of [1020, 1040, 1060]) {
      pointer("pointermove", { clientX: now === 1040 ? 400 : -200 });
      expected.y -= tuning.gravity * dt;
      expected.multiplyScalar(Math.exp(-tuning.drag * dt));
      step(now);
      expect(shard.velocity.distanceTo(expected)).toBeLessThan(1e-10);
    }
    pointer("pointerup", { buttons: 0 });
    expect(key("r", {}, "keyup").defaultPrevented).toBe(false);
    expect(captureSurface).toHaveBeenCalledOnce();
  });

  it("restores the page when the GPU context is lost", async () => {
    dispose = setup();
    click(document.body);
    await vi.waitFor(() =>
      expect(document.body.hasAttribute("inert")).toBe(true),
    );
    document
      .querySelector("canvas")
      ?.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(document.body.hasAttribute("inert")).toBe(false);
    expect(renderState.dispose).toHaveBeenCalledOnce();
  });
});
