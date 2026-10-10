import {
  HalfFloatType,
  Mesh,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";
import { FRACTURE_TUNING as tuning } from "./tuning";

/** Integrate a circular aperture over every texel; no sparse rings or random taps. */
export function apertureKernel(radius: number) {
  if (radius <= 0) return [{ x: 0, y: 0, weight: 1 }];
  const extent = Math.ceil(radius + 0.5);
  const taps: { x: number; y: number; weight: number }[] = [];
  let total = 0;
  for (let y = -extent; y <= extent; y++) {
    const row: number[] = [];
    for (let x = -extent; x <= extent; x++) {
      let coverage = 0;
      for (let sy = 0; sy < 8; sy++) {
        for (let sx = 0; sx < 8; sx++) {
          const px = x + (sx + 0.5) / 8 - 0.5;
          const py = y + (sy + 0.5) / 8 - 0.5;
          if (px * px + py * py <= radius * radius) coverage++;
        }
      }
      row.push(coverage);
      total += coverage;
    }
    // One bilinear lookup exactly combines two adjacent, positive texel weights.
    for (let i = 0; i < row.length; i += 2) {
      const a = row[i] ?? 0;
      const b = row[i + 1] ?? 0;
      if (a + b > 0)
        taps.push({ x: i - extent + b / (a + b), y, weight: a + b });
    }
  }
  return total > 0
    ? taps.map((tap) => ({ ...tap, weight: tap.weight / total }))
    : [{ x: 0, y: 0, weight: 1 }];
}

const vertexShader = `varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;
const depthShader = `
  uniform sampler2D colorMap;
  uniform sampler2D depthMap;
  uniform float focusDistance;
  uniform float apertureRadius;
  uniform float maxBlurRadius;
  varying vec2 vUv;
  float blurAt(vec2 uv) {
    float depth = texture2D(depthMap, uv).x;
    float distance = 4000. / (4000. - depth * 3999.);
    // Thin-lens circle of confusion. Projection scale equals focusDistance in
    // our pixel-sized scene, so apertureRadius is also measured in CSS pixels.
    return min(maxBlurRadius, apertureRadius * abs(focusDistance / distance - 1.));
  }
`;
const glsl = (n: number) => n.toFixed(9);

function material(
  fragmentShader: string,
  uniforms: ShaderMaterial["uniforms"],
) {
  return new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });
}

/** Continuous depth bands with dense aperture filtering and premultiplied alpha. */
export class DepthBlur {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly layers: {
    source: WebGLRenderTarget;
    target: WebGLRenderTarget;
    resolution: number;
    texel: { value: Vector2 };
    extract: ShaderMaterial;
    blur: ShaderMaterial;
  }[];
  private readonly composite: ShaderMaterial;
  private readonly quad: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor(
    source: WebGLRenderTarget,
    focusDistance: number,
    renderer: WebGLRenderer,
  ) {
    const type = renderer.extensions.has("EXT_color_buffer_float")
      ? HalfFloatType
      : UnsignedByteType;
    const target = () =>
      new WebGLRenderTarget(1, 1, { depthBuffer: false, type });
    const depthUniforms = {
      colorMap: { value: source.texture },
      depthMap: { value: source.depthTexture },
      focusDistance: { value: focusDistance },
      apertureRadius: { value: tuning.apertureRadius },
      maxBlurRadius: { value: tuning.maxBlurRadius },
    };
    const radii = [0.0625, 0.125, 0.25, 0.5, 1].map(
      (f) => Math.max(0.001, tuning.maxBlurRadius) * f,
    );
    this.layers = radii.map((radius, i) => {
      // Large bokeh doesn't need a large sparse kernel: reduce resolution until
      // every texel in the aperture is affordable to sample. Stable when rotating.
      const resolution = Math.min(
        Math.max(0.25, Math.min(1, tuning.blurResolutionScale)),
        Math.max(1, tuning.apertureKernelRadius) / radius,
      );
      const texel = { value: new Vector2(1, 1) };
      const lower = radii[i - 1] ?? 0;
      const upper = radii[i + 1];
      const weight =
        `smoothstep(${glsl(lower)}, ${glsl(radius)}, r)` +
        (upper === undefined
          ? ""
          : ` * (1. - smoothstep(${glsl(radius)}, ${glsl(upper)}, r))`);
      const extract = material(
        `${depthShader}
        uniform vec2 texel;
        void main() {
          vec4 color = vec4(0.);
          // Keep coverage and depth paired when downsampling thin silhouettes.
          for (int y = 0; y < 4; y++) {
            for (int x = 0; x < 4; x++) {
              vec2 uv = vUv + (vec2(float(x), float(y)) * .25 - .375) * texel;
              float r = blurAt(uv);
              color += texture2D(colorMap, uv) * (${weight});
            }
          }
          gl_FragColor = color / 16.;
        }`,
        { ...depthUniforms, texel },
      );
      const input = target();
      const taps = apertureKernel(radius * resolution);
      const blur = material(
        `
        uniform sampler2D colorMap;
        uniform vec2 texel;
        varying vec2 vUv;
        vec4 sampleAperture(vec2 offset) {
          vec2 uv = vUv + offset * texel;
          // The world outside the viewport is transparent, not a clamped edge.
          if (any(lessThan(uv, vec2(0.))) || any(greaterThan(uv, vec2(1.))))
            return vec4(0.);
          return texture2D(colorMap, uv);
        }
        void main() {
          vec4 color = vec4(0.);
          ${taps.map((t) => `color += sampleAperture(vec2(${glsl(t.x)}, ${glsl(t.y)})) * ${glsl(t.weight)};`).join("\n")}
          gl_FragColor = color;
        }`,
        { colorMap: { value: input.texture }, texel },
      );
      return {
        source: input,
        target: target(),
        resolution,
        texel,
        extract,
        blur,
      };
    });
    this.composite = material(
      `${depthShader}
      ${this.layers.map((_, i) => `uniform sampler2D layer${i};`).join("\n")}
      void main() {
        float sharp = 1. - smoothstep(0., ${glsl(radii[0] ?? 1)}, blurAt(vUv));
        vec4 color = texture2D(colorMap, vUv) * sharp;
        ${this.layers.map((_, i) => `color += texture2D(layer${i}, vUv);`).join("\n")}
        // Complementary band weights preserve energy through focus transitions.
        // Keep color premultiplied until the final color-space conversion.
        gl_FragColor = vec4(color.rgb / max(color.a, .00001), min(color.a, 1.));
        #include <colorspace_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;
      }`,
      {
        ...depthUniforms,
        ...Object.fromEntries(
          this.layers.map((layer, i) => [
            `layer${i}`,
            { value: layer.target.texture },
          ]),
        ),
      },
    );
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.composite);
    this.scene.add(this.quad);
  }

  resize(width: number, height: number) {
    this.layers.forEach((layer) => {
      const w = Math.max(1, Math.round(width * layer.resolution));
      const h = Math.max(1, Math.round(height * layer.resolution));
      layer.source.setSize(w, h);
      layer.target.setSize(w, h);
      layer.texel.value.set(1 / w, 1 / h);
    });
  }

  draw(renderer: WebGLRenderer) {
    const pass = (shader: ShaderMaterial, target: WebGLRenderTarget | null) => {
      this.quad.material = shader;
      renderer.setRenderTarget(target);
      renderer.render(this.scene, this.camera);
    };
    for (const layer of this.layers) {
      pass(layer.extract, layer.source);
      pass(layer.blur, layer.target);
    }
    pass(this.composite, null);
  }

  dispose() {
    for (const layer of this.layers) {
      layer.source.dispose();
      layer.target.dispose();
      layer.extract.dispose();
      layer.blur.dispose();
    }
    this.composite.dispose();
    this.quad.geometry.dispose();
  }
}
