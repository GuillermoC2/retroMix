import * as THREE from 'three';

/**
 * Tinte neón en degradado según la altura (Y del mundo) que además fluye con el
 * tiempo. Se inyecta en materiales Lambert: sus texturas actúan como máscaras
 * en escala de grises (blanco = color neón pleno, gris oscuro = relleno tenue).
 * Todos los materiales comparten los mismos uniformes, así que basta con
 * actualizar `time` una vez por fotograma.
 */
export class NeonGradient {
  readonly uniforms: {
    uNeonColors: { value: THREE.Color[] };
    uNeonTime: { value: number };
    uNeonRowsPerColor: { value: number };
    uNeonFlow: { value: number };
    uNeonSteps: { value: number };
  };
  private readonly count: number;

  constructor(colors: readonly number[], rowsPerColor: number, flowRowsPerSecond: number, steps: number) {
    this.count = colors.length;
    this.uniforms = {
      uNeonColors: { value: colors.map((c) => new THREE.Color(c)) },
      uNeonTime: { value: 0 },
      uNeonRowsPerColor: { value: rowsPerColor },
      uNeonFlow: { value: flowRowsPerSecond },
      uNeonSteps: { value: steps },
    };
  }

  update(dt: number): void {
    this.uniforms.uNeonTime.value += dt;
  }

  /** Mismo cálculo que `neonAt()` del shader, para colorear efectos en CPU. */
  colorAt(y: number, target = new THREE.Color()): THREE.Color {
    const u = this.uniforms;
    const n = this.count;
    const t = ((((y - u.uNeonTime.value * u.uNeonFlow.value) / u.uNeonRowsPerColor.value) % n) + n) % n;
    const i = Math.floor(t);
    const f = Math.floor((t - i) * u.uNeonSteps.value) / u.uNeonSteps.value;
    const colors = u.uNeonColors.value;
    return target.copy(colors[i]).lerp(colors[(i + 1) % n], f);
  }

  /** Aplica el tinte a un material: multiplica el color difuso y el emisivo. */
  apply<M extends THREE.MeshLambertMaterial>(material: M): M {
    const n = this.count;
    material.customProgramCacheKey = () => `neon${n}`;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vNeonY;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNeonY = (modelMatrix * vec4(transformed, 1.0)).y;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          varying float vNeonY;
          uniform vec3 uNeonColors[${n}];
          uniform float uNeonTime;
          uniform float uNeonRowsPerColor;
          uniform float uNeonFlow;
          uniform float uNeonSteps;
          vec3 neonAt(float y) {
            // Posición en la paleta: avanza con la altura y fluye hacia arriba con el tiempo.
            float t = mod((y - uNeonTime * uNeonFlow) / uNeonRowsPerColor, ${n}.0);
            int i = int(floor(t));
            int j = int(mod(float(i) + 1.0, ${n}.0));
            // Transición en escalones discretos, más acorde al pixel art.
            float f = floor(fract(t) * uNeonSteps) / uNeonSteps;
            return mix(uNeonColors[i], uNeonColors[j], f);
          }`,
        )
        .replace('#include <map_fragment>', '#include <map_fragment>\nvec3 neon = neonAt(vNeonY);\ndiffuseColor.rgb *= neon;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= neon;');
    };
    return material;
  }
}
