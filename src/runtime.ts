import { Mesh, Quaternion, Raycaster, Vector2, Vector3 } from "three";
import { area, center, fracture, type Point, type Polygon } from "./fracture";
import { REFRACTURE_PARAMS } from "./params";
import { impactBias, sampleImpulse } from "./impulse";
import { FRACTURE_TUNING as tuning } from "./tuning";
import { createHud } from "./hud";
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

interface Surface {
  snapshot: Snapshot;
  appearance: ReturnType<typeof makeMaterials>;
  references: number;
}

interface Shard {
  polygon: Polygon;
  mesh: Mesh;
  surface: Surface;
  velocity: Vector3;
  spin: Vector3;
  thickness: number;
  generation: number;
  age: number;
}

const sessions = new WeakMap<Document, () => void>();

/** Activate the lazy DOM shatter effect; repeated calls are safe. Escape or the returned function restores the page. */
export function setup(): () => void {
  const existing = sessions.get(document);
  if (existing) return existing;
  const view = new FractureRenderer();
  const canvas = view.renderer.domElement;
  canvas.setAttribute(overlayAttribute, "");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;pointer-events:none;z-index:2147483647;background:transparent;overflow:visible";
  const style = document.createElement("style");
  style.textContent = `html, html * { cursor: crosshair !important; }
    [${hiddenAttribute}], [${hiddenAttribute}] * { visibility: hidden !important; pointer-events: none !important; }
    [${overlayAttribute}]::backdrop { pointer-events: none; background: transparent; }`;
  document.head.append(style);
  document.body.append(canvas);
  // The top layer keeps fragments above native dialogs as well as framework portals.
  if (typeof canvas.showPopover === "function") {
    canvas.setAttribute("popover", "manual");
    canvas.showPopover();
  }

  const shards: Shard[] = [];
  const restores: (() => void)[] = [];
  const pending = new Set<Element>();
  const originalFocus = document.activeElement;
  const raycaster = new Raycaster();
  let stopped = false;
  let frame = 0;
  let previous = 0;
  let timeScale: number = tuning.timeScale;
  const hud = createHud();
  const settle = () => {
    if (!stopped && !shards.length && !pending.size) hud.show();
  };
  let lastPointer: Point = { x: innerWidth / 2, y: innerHeight / 2 };
  const screenPosition = new Vector3();

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
    while (shards.length > tuning.maxShards) {
      const oldest = shards.shift();
      if (oldest) release(oldest);
    }
  };

  const addShard = (
    polygon: Polygon,
    surface: Surface,
    parent?: Shard,
  ): Shard => {
    const c = center(polygon);
    const thickness = parent
      ? Math.max(0.35 * tuning.thicknessScale, parent.thickness * 0.8)
      : Math.min(3, Math.max(0.8, Math.sqrt(area(polygon)) * 0.055)) *
        tuning.thicknessScale;
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
      velocity,
      spin: parent?.spin.clone() ?? new Vector3(),
      thickness,
      generation: (parent?.generation ?? -1) + 1,
      age: 0,
    };
    surface.references++;
    mesh.userData.shard = shard;
    shards.push(shard);
    view.scene.add(mesh);
    return shard;
  };

  const blast = (point: Point, affected: Shard[]) => {
    hud.hide();
    for (const shard of affected) {
      const delta = displacement(shard, point);
      const impulse = sampleImpulse(delta.x, delta.y, {
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
      shard.velocity.clampLength(0, tuning.maxSpeed);
      shard.spin.clampLength(0, tuning.maxSpin);
    }
  };

  const animate = (now: number) => {
    frame = 0;
    if (stopped || document.hidden) return;
    const dt =
      Math.min(previous ? (now - previous) / 1000 : 0, 0.05) * timeScale;
    previous = now;
    for (let i = shards.length - 1; i >= 0; i--) {
      const shard = shards[i];
      if (!shard) continue;
      shard.age += dt;
      shard.velocity.y -= tuning.gravity * dt;
      shard.velocity.multiplyScalar(Math.exp(-tuning.drag * dt));
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
        shard.age > 18
      ) {
        release(shard);
        shards.splice(i, 1);
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
        const children = fracture(shard.polygon, impact, REFRACTURE_PARAMS);
        const fresh = children.map((polygon) =>
          addShard(polygon, shard.surface, shard),
        );
        shards.splice(shards.indexOf(shard), 1);
        release(shard);
        blast(point, fresh);
      } else {
        blast(point, [shard]);
      }
      return true;
    }
    return false;
  };

  const fire = async (point: Point, start: Element | null) => {
    if (hitShard(point)) {
      trim();
      wake();
      return;
    }
    const element = findSurface(start);
    if (
      !element ||
      pending.size >= 3 ||
      Array.from(pending).some(
        (node) => node.contains(element) || element.contains(node),
      )
    )
      return;
    pending.add(element);
    hud.hide();
    const initial = element.getBoundingClientRect();
    let fresh: Shard[] = [];
    try {
      const snapshot = await captureSurface(element);
      if (
        stopped ||
        !element.isConnected ||
        element.closest(`[${hiddenAttribute}]`)
      )
        return;
      const current = element.getBoundingClientRect();
      // Scrolling, navigation, or relayout during capture invalidates the screen-space texture.
      if (
        Math.abs(current.left - initial.left) > 1 ||
        Math.abs(current.top - initial.top) > 1 ||
        Math.abs(current.width - initial.width) > 1 ||
        Math.abs(current.height - initial.height) > 1
      )
        return;
      const polygon = [
        { x: 0, y: 0 },
        { x: snapshot.width, y: 0 },
        { x: snapshot.width, y: snapshot.height },
        { x: 0, y: snapshot.height },
      ];
      const pieces = fracture(polygon, {
        x: point.x - snapshot.left,
        y: point.y - snapshot.top,
      });
      const surface: Surface = {
        snapshot,
        appearance: makeMaterials(snapshot),
        references: 0,
      };
      fresh = pieces.map((piece) => addShard(piece, surface));
      // Upload/draw successfully before touching the DOM. Failed capture never hides the original.
      view.draw();
      restores.push(hideSurface(element));
      blast(point, fresh);
      trim();
      wake();
      hud.recordDestruction();
    } catch (error) {
      fresh.forEach((shard) => {
        const index = shards.indexOf(shard);
        if (index >= 0) {
          shards.splice(index, 1);
          release(shard);
        }
      });
      console.warn("Fracture Lens could not capture this surface", error);
    } finally {
      pending.delete(element);
      settle();
    }
  };

  const block = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const pointer = (event: MouseEvent) => {
    lastPointer = { x: event.clientX, y: event.clientY };
  };
  const pointerdown = (event: MouseEvent) => {
    block(event);
    pointer(event);
  };
  const click = (event: MouseEvent) => {
    block(event);
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const rect = target?.getBoundingClientRect();
    const point =
      event.detail === 0 && rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: event.clientX, y: event.clientY };
    void fire(point, target);
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      block(event);
      dispose();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (["+", "=", "-"].includes(event.key)) {
      block(event);
      timeScale = Math.max(
        tuning.minTimeScale,
        Math.min(
          tuning.maxTimeScale,
          timeScale *
            (event.key === "-"
              ? 1 / tuning.timeScaleStep
              : tuning.timeScaleStep),
        ),
      );
      return;
    }
    // Enter/Space shatter the focused control; F shatters at the last pointer location.
    // Leave Tab/Shift+Tab native so keyboard users can reach any surviving control.
    if (!["Enter", " ", "f", "F"].includes(event.key)) return;
    block(event);
    if (event.repeat) return;
    const focused = document.activeElement;
    const usePointer =
      event.key.toLowerCase() === "f" || focused === document.body;
    const bounds = !usePointer ? focused?.getBoundingClientRect() : null;
    const point = bounds
      ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
      : lastPointer;
    void fire(
      point,
      usePointer ? document.elementFromPoint(point.x, point.y) : focused,
    );
  };
  const keyup = (event: KeyboardEvent) => {
    if (["Enter", " "].includes(event.key)) block(event);
  };
  const resize = () => {
    view.resize();
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
    sessions.delete(document);
    cancelAnimationFrame(frame);
    window.removeEventListener("click", click, true);
    window.removeEventListener("pointerdown", pointerdown, true);
    window.removeEventListener("mousedown", block, true);
    window.removeEventListener("pointerup", block, true);
    window.removeEventListener("mouseup", block, true);
    window.removeEventListener("dblclick", block, true);
    window.removeEventListener("auxclick", block, true);
    window.removeEventListener("pointermove", pointer, true);
    window.removeEventListener("keydown", keydown, true);
    window.removeEventListener("keyup", keyup, true);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pagehide", dispose);
    document.removeEventListener("visibilitychange", visibility);
    canvas.removeEventListener("webglcontextlost", contextLost);
    restores.reverse().forEach((restore) => restore());
    shards.forEach(release);
    shards.length = 0;
    style.remove();
    hud.dispose();
    view.dispose();
    if (originalFocus instanceof HTMLElement && originalFocus.isConnected)
      originalFocus.focus({ preventScroll: true });
  }

  sessions.set(document, dispose);
  window.addEventListener("click", click, true);
  window.addEventListener("pointerdown", pointerdown, true);
  window.addEventListener("mousedown", block, true);
  window.addEventListener("pointerup", block, true);
  window.addEventListener("mouseup", block, true);
  window.addEventListener("dblclick", block, true);
  window.addEventListener("auxclick", block, true);
  window.addEventListener("pointermove", pointer, true);
  window.addEventListener("keydown", keydown, true);
  window.addEventListener("keyup", keyup, true);
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", dispose);
  document.addEventListener("visibilitychange", visibility);
  canvas.addEventListener("webglcontextlost", contextLost);
  return dispose;
}
