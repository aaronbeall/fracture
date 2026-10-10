import { Mesh, Quaternion, Raycaster, Vector2, Vector3 } from "three";
import {
  area,
  center,
  fracture as fracturePolygon,
  rectangle,
  type Point,
  type Polygon,
} from "./fracture";
import { impactBias, sampleImpulse } from "./impulse";
import {
  DEFAULT_BLUR_PARAMS,
  DEFAULT_FRACTURE_PARAMS,
  DEFAULT_IMPULSE_PARAMS,
  DEFAULT_MOTION_PARAMS,
  REFRACTURE_PARAMS,
  type ImpulseParams,
} from "./params";
import {
  cameraDistance,
  FractureRenderer,
  makeGeometry,
  makeMaterials,
} from "./renderer";
import {
  captureSurface,
  findSurface,
  hiddenAttribute,
  hideSurface,
  opaqueAt,
  overlayAttribute,
  type Snapshot,
} from "./surface";
import type {
  FractureElementOptions,
  FractureResult,
  FractureStage,
  PointLike,
  StageOptions,
  StrikeOptions,
} from "./types";

interface Surface {
  snapshot: Snapshot;
  appearance: ReturnType<typeof makeMaterials>;
  impulse: ImpulseParams;
  references: number;
}

interface Batch {
  shards: number;
  resolve: () => void;
}

interface Shard {
  polygon: Polygon;
  mesh: Mesh;
  surface: Surface;
  batch: Batch;
  velocity: Vector3;
  spin: Vector3;
  thickness: number;
  generation: number;
  age: number;
}

/** Viewport point for an impact; keyboard clicks (detail 0) and missing points use the element center. */
export function resolvePoint(at: PointLike | undefined, element?: Element) {
  const bounds = element?.getBoundingClientRect();
  const middle = bounds && {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
  if (!at) return middle ?? { x: innerWidth / 2, y: innerHeight / 2 };
  if ("clientX" in at)
    return at.detail === 0 && middle
      ? middle
      : { x: at.clientX, y: at.clientY };
  return { x: at.x, y: at.y };
}

/** Create a transparent WebGL overlay that turns DOM elements into flying shards. */
export function createStage(stageOptions: StageOptions = {}): FractureStage {
  const fractureParams = {
    ...DEFAULT_FRACTURE_PARAMS,
    ...stageOptions.fracture,
  };
  const refractureParams = { ...REFRACTURE_PARAMS, ...stageOptions.refracture };
  const impulseParams = { ...DEFAULT_IMPULSE_PARAMS, ...stageOptions.impulse };
  const motion = { ...DEFAULT_MOTION_PARAMS, ...stageOptions.motion };
  const view = new FractureRenderer(
    stageOptions.blur === false
      ? false
      : { ...DEFAULT_BLUR_PARAMS, ...stageOptions.blur },
  );
  const canvas = view.renderer.domElement;
  canvas.setAttribute(overlayAttribute, "");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = `position:fixed;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;pointer-events:none;z-index:${stageOptions.zIndex ?? 2147483647};background:transparent;overflow:visible`;
  const style = document.createElement("style");
  style.textContent = `[${hiddenAttribute}], [${hiddenAttribute}] * { visibility: hidden !important; pointer-events: none !important; }
    [${overlayAttribute}]::backdrop { pointer-events: none; background: transparent; }`;
  document.head.append(style);
  document.body.append(canvas);

  const shards: Shard[] = [];
  const restores = new Map<Element, () => void>();
  const pending = new Set<Element>();
  const idlers: (() => void)[] = [];
  const raycaster = new Raycaster();
  const screenPosition = new Vector3();
  let stopped = false;
  let busy = false;
  let frame = 0;
  let previous = 0;

  // The top layer keeps fragments above native dialogs and popovers opened since the last raise.
  const raise = () => {
    if (typeof canvas.showPopover !== "function") return;
    canvas.setAttribute("popover", "manual");
    if (canvas.matches(":popover-open")) canvas.hidePopover();
    canvas.showPopover();
  };
  raise();

  const settle = () => {
    if (stopped || shards.length || pending.size) return;
    idlers.splice(0).forEach((resolve) => resolve());
    if (busy) stageOptions.onIdle?.();
    busy = false;
  };

  const displacement = (shard: Shard, point: Point): Point => {
    screenPosition.copy(shard.mesh.position).project(view.camera);
    return {
      x: ((screenPosition.x + 1) * innerWidth) / 2 - point.x,
      y: ((1 - screenPosition.y) * innerHeight) / 2 - point.y,
    };
  };

  const biasFor = (shard: Shard, point: Point): Point => {
    const { left, top, width, height } = shard.surface.snapshot;
    return impactBias({ x: point.x - left, y: point.y - top }, width, height);
  };

  const release = (shard: Shard) => {
    view.scene.remove(shard.mesh);
    shard.mesh.geometry.dispose();
    if (--shard.batch.shards === 0) shard.batch.resolve();
    shard.surface.references--;
    if (shard.surface.references === 0) {
      shard.surface.appearance.materials.forEach((material) =>
        material.dispose(),
      );
      shard.surface.appearance.texture.dispose();
      shard.surface.snapshot.canvas.width = 0;
      shard.surface.snapshot.canvas.height = 0;
    }
  };

  const trim = () => {
    while (shards.length > motion.maxShards) {
      const oldest = shards.shift();
      if (oldest) release(oldest);
    }
  };

  const addShard = (
    polygon: Polygon,
    surface: Surface,
    batch: Batch,
    parent?: Shard,
  ): Shard => {
    const c = center(polygon);
    const thickness = parent
      ? Math.max(0.35 * motion.thicknessScale, parent.thickness * 0.8)
      : Math.min(3, Math.max(0.8, Math.sqrt(area(polygon)) * 0.055)) *
        motion.thicknessScale;
    const mesh = new Mesh(
      makeGeometry(polygon, thickness, surface.snapshot),
      surface.appearance.materials,
    );
    const velocity = parent?.velocity.clone() ?? new Vector3();
    if (parent) {
      const pc = center(parent.polygon);
      const offset = new Vector3(c.x - pc.x, pc.y - c.y, 0).applyQuaternion(
        parent.mesh.quaternion,
      );
      mesh.position.copy(parent.mesh.position).add(offset);
      mesh.quaternion.copy(parent.mesh.quaternion);
      velocity.add(new Vector3().crossVectors(parent.spin, offset));
    } else {
      mesh.position.set(
        surface.snapshot.left + c.x,
        -surface.snapshot.top - c.y,
        0,
      );
    }
    const shard: Shard = {
      polygon,
      mesh,
      surface,
      batch,
      velocity,
      spin: parent?.spin.clone() ?? new Vector3(),
      thickness,
      generation: (parent?.generation ?? -1) + 1,
      age: 0,
    };
    surface.references++;
    batch.shards++;
    mesh.userData.shard = shard;
    shards.push(shard);
    view.scene.add(mesh);
    return shard;
  };

  const blast = (point: Point, affected: Shard[]) => {
    for (const shard of affected) {
      const delta = displacement(shard, point);
      const impulse = sampleImpulse(delta.x, delta.y, {
        ...shard.surface.impulse,
        bias: biasFor(shard, point),
      });
      // A tangential component makes the blast spiral; far pieces barely move until gravity wins.
      shard.velocity.add(
        new Vector3(impulse.velocity.x, impulse.velocity.y, impulse.velocity.z),
      );
      shard.spin.add(
        new Vector3(impulse.spin.x, impulse.spin.y, impulse.spin.z),
      );
      // Bound repeated impulses without flattening the exponential distance response.
      shard.velocity.clampLength(0, motion.maxSpeed);
      shard.spin.clampLength(0, motion.maxSpin);
    }
  };

  const animate = (now: number) => {
    frame = 0;
    if (stopped || document.hidden) return;
    const dt =
      Math.min(previous ? (now - previous) / 1000 : 0, 0.05) * stage.timeScale;
    previous = now;
    for (let i = shards.length - 1; i >= 0; i--) {
      const shard = shards[i];
      if (!shard) continue;
      shard.age += dt;
      shard.velocity.y -= motion.gravity * dt;
      shard.velocity.multiplyScalar(Math.exp(-motion.drag * dt));
      shard.mesh.position.addScaledVector(shard.velocity, dt);
      const speed = shard.spin.length();
      if (speed > 0)
        shard.mesh.quaternion.premultiply(
          new Quaternion().setFromAxisAngle(
            shard.spin.clone().divideScalar(speed),
            speed * dt,
          ),
        );
      if (
        shard.mesh.position.z > cameraDistance - 55 ||
        shard.mesh.position.y < -innerHeight - 900 ||
        shard.age > motion.maxAge
      ) {
        shards.splice(i, 1);
        release(shard);
      }
    }
    view.draw();
    if (shards.length) frame = requestAnimationFrame(animate);
    else settle();
  };

  const wake = () => {
    if (!frame && !stopped && !document.hidden) {
      previous = 0;
      frame = requestAnimationFrame(animate);
    }
  };

  const hitShard = (point: Point): boolean => {
    view.scene.updateMatrixWorld(true);
    raycaster.setFromCamera(
      new Vector2(
        (point.x / innerWidth) * 2 - 1,
        1 - (point.y / innerHeight) * 2,
      ),
      view.camera,
    );
    const hits = raycaster.intersectObjects(
      shards.map((shard) => shard.mesh),
      false,
    );
    for (const hit of hits) {
      const shard = hit.object.userData.shard as Shard;
      const local = shard.mesh.worldToLocal(hit.point.clone());
      const c = center(shard.polygon);
      const impact = { x: local.x + c.x, y: c.y - local.y };
      if (!opaqueAt(shard.surface.snapshot, impact)) continue;
      if (area(shard.polygon) > 24 && shard.generation < 5) {
        const children = fracturePolygon(
          shard.polygon,
          impact,
          refractureParams,
        );
        const fresh = children.map((polygon) =>
          addShard(polygon, shard.surface, shard.batch, shard),
        );
        shards.splice(shards.indexOf(shard), 1);
        release(shard);
        blast(point, fresh);
      } else {
        blast(point, [shard]);
      }
      trim();
      wake();
      return true;
    }
    return false;
  };

  const restoreElement = (element: Element) => {
    restores.get(element)?.();
    restores.delete(element);
  };

  const fractureElement = async (
    element: Element,
    options: FractureElementOptions = {},
  ): Promise<FractureResult> => {
    if (stopped) throw new Error("Fracture stage is disposed");
    if (!(element instanceof HTMLElement || element instanceof SVGSVGElement))
      throw new Error("Only HTML elements and <svg> roots can be fractured");
    if (
      element.closest(`[${hiddenAttribute}]`) ||
      Array.from(pending).some(
        (node) => node.contains(element) || element.contains(node),
      )
    )
      throw new Error("Element is already fractured");
    const point = resolvePoint(options.at, element);
    pending.add(element);
    busy = true;
    const initial = element.getBoundingClientRect();
    const fresh: Shard[] = [];
    try {
      const snapshot = await captureSurface(element);
      if (stopped) throw new Error("Fracture stage is disposed");
      if (!element.isConnected || element.closest(`[${hiddenAttribute}]`))
        throw new Error("Element was removed or hidden during capture");
      const current = element.getBoundingClientRect();
      // Scrolling, navigation, or relayout during capture invalidates the screen-space texture.
      if (
        Math.abs(current.left - initial.left) > 1 ||
        Math.abs(current.top - initial.top) > 1 ||
        Math.abs(current.width - initial.width) > 1 ||
        Math.abs(current.height - initial.height) > 1
      )
        throw new Error("Element moved during capture");
      const pieces = fracturePolygon(
        rectangle(snapshot.width, snapshot.height),
        { x: point.x - snapshot.left, y: point.y - snapshot.top },
        { ...fractureParams, ...options.fracture },
      );
      const surface: Surface = {
        snapshot,
        appearance: makeMaterials(snapshot),
        impulse: { ...impulseParams, ...options.impulse },
        references: 0,
      };
      let resolve!: () => void;
      const settled = new Promise<void>((done) => (resolve = done));
      const batch: Batch = { shards: 0, resolve };
      pieces.forEach((piece) => fresh.push(addShard(piece, surface, batch)));
      raise();
      // Upload/draw successfully before touching the DOM. Failed capture never hides the original.
      view.draw();
      if (options.hide !== false) restores.set(element, hideSurface(element));
      blast(point, fresh);
      trim();
      wake();
      const result: FractureResult = {
        element,
        pieces: pieces.length,
        settled,
        restore: () => restoreElement(element),
      };
      stageOptions.onFracture?.(result);
      return result;
    } catch (error) {
      fresh.forEach((shard) => {
        const index = shards.indexOf(shard);
        if (index >= 0) {
          shards.splice(index, 1);
          release(shard);
        }
      });
      throw error;
    } finally {
      pending.delete(element);
      settle();
    }
  };

  const strike = async (
    at: PointLike,
    { target }: StrikeOptions = {},
  ): Promise<boolean> => {
    if (stopped) return false;
    const point = resolvePoint(at, target ?? undefined);
    if (hitShard(point)) return true;
    const element = findSurface(
      target === undefined
        ? document.elementFromPoint(point.x, point.y)
        : target,
    );
    if (
      !element ||
      pending.size >= 3 ||
      Array.from(pending).some(
        (node) => node.contains(element) || element.contains(node),
      )
    )
      return false;
    try {
      await fractureElement(element, { at: point });
      return true;
    } catch (error) {
      if (!stopped)
        console.warn("Fracture could not capture this element", error);
      return false;
    }
  };

  const clear = () => {
    shards.splice(0).forEach(release);
    if (!stopped) view.draw();
    settle();
  };

  const resize = () => {
    view.resize();
    view.draw();
    wake();
  };
  const visibility = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    if (!document.hidden && shards.length) wake();
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    dispose();
  };
  function dispose() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pagehide", dispose);
    document.removeEventListener("visibilitychange", visibility);
    canvas.removeEventListener("webglcontextlost", contextLost);
    Array.from(restores.keys()).reverse().forEach(restoreElement);
    shards.splice(0).forEach(release);
    style.remove();
    view.dispose();
    idlers.splice(0).forEach((resolve) => resolve());
  }

  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", dispose);
  document.addEventListener("visibilitychange", visibility);
  canvas.addEventListener("webglcontextlost", contextLost);

  const stage: FractureStage = {
    fracture: fractureElement,
    strike,
    idle: () =>
      stopped || (!shards.length && !pending.size)
        ? Promise.resolve()
        : new Promise<void>((resolve) => idlers.push(resolve)),
    clear,
    restore() {
      clear();
      Array.from(restores.keys()).reverse().forEach(restoreElement);
    },
    timeScale: motion.timeScale,
    get shardCount() {
      return shards.length;
    },
    get disposed() {
      return stopped;
    },
    dispose,
  };
  return stage;
}
