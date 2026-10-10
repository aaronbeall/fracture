import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  DepthTexture,
  DirectionalLight,
  Float32BufferAttribute,
  MeshStandardMaterial,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  UnsignedIntType,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { center, vertex, type Polygon } from "./fracture.js";
import type { Snapshot } from "./surface.js";
import { DepthBlur } from "./depth-blur.js";
import { DEFAULT_BLUR_PARAMS, type BlurParams } from "./params.js";

export const cameraDistance = 1000;

export function makeGeometry(
  polygon: Polygon,
  thickness: number,
  snapshot: Snapshot,
): BufferGeometry {
  const c = center(polygon);
  const vertices: number[] = [];
  const uvs: number[] = [];
  const add = (p: { x: number; y: number }, z: number) => {
    vertices.push(p.x - c.x, c.y - p.y, z);
    uvs.push(p.x / snapshot.width, 1 - p.y / snapshot.height);
  };
  // Polygon winding is positive in screen coordinates (down is +y).
  for (let i = 1; i < polygon.length - 1; i++) {
    [vertex(polygon, 0), vertex(polygon, i + 1), vertex(polygon, i)].forEach(
      (p) => add(p, thickness / 2),
    );
    [vertex(polygon, 0), vertex(polygon, i), vertex(polygon, i + 1)].forEach(
      (p) => add(p, -thickness / 2),
    );
  }
  const faces = vertices.length / 3;
  for (let i = 0; i < polygon.length; i++) {
    const a = vertex(polygon, i);
    const b = vertex(polygon, i + 1);
    add(a, thickness / 2);
    add(b, thickness / 2);
    add(b, -thickness / 2);
    add(a, thickness / 2);
    add(b, -thickness / 2);
    add(a, -thickness / 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.addGroup(0, faces, 0);
  geometry.addGroup(faces, vertices.length / 3 - faces, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function makeMaterials(snapshot: Snapshot) {
  const texture = new CanvasTexture(snapshot.canvas);
  texture.colorSpace = SRGBColorSpace;
  const face = new MeshStandardMaterial({
    map: texture,
    roughness: 0.65,
    metalness: 0.12,
    transparent: true,
    alphaTest: 0.025,
  });
  const edge = new MeshStandardMaterial({
    map: texture,
    color: 0x8699ab,
    roughness: 0.48,
    metalness: 0.3,
    transparent: true,
    alphaTest: 0.025,
  });
  return { texture, materials: [face, edge] };
}

/** A transparent scene with an alpha-preserving lens blur focused on the original DOM plane. */
export class FractureRenderer {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(45, 1, 1, 4000);
  readonly renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  private readonly target = new WebGLRenderTarget(1, 1, {
    depthTexture: new DepthTexture(1, 1, UnsignedIntType),
  });
  private readonly depthBlur: DepthBlur | null;

  /** Pass `false` to render pieces without depth-of-field blur. */
  constructor(blur: BlurParams | false = DEFAULT_BLUR_PARAMS) {
    this.depthBlur = blur
      ? new DepthBlur(this.target, cameraDistance, this.renderer, blur)
      : null;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.camera.position.z = cameraDistance;
    this.scene.add(new AmbientLight(0xffffff, 1.7));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(-300, 500, 900);
    this.scene.add(key);
    const rim = new DirectionalLight(0xb7d6ff, 1.5);
    rim.position.set(500, -100, -200);
    this.scene.add(rim);
    this.resize();
  }

  resize() {
    const ratio = Math.min(devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.target.setSize(
      Math.round(innerWidth * ratio),
      Math.round(innerHeight * ratio),
    );
    this.depthBlur?.resize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.fov =
      (2 * Math.atan(innerHeight / (2 * cameraDistance)) * 180) / Math.PI;
    this.camera.position.set(innerWidth / 2, -innerHeight / 2, cameraDistance);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  draw() {
    this.renderer.setRenderTarget(this.depthBlur ? this.target : null);
    this.renderer.render(this.scene, this.camera);
    this.depthBlur?.draw(this.renderer);
  }

  dispose() {
    this.target.dispose();
    this.depthBlur?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
