import * as THREE from 'three';

/**
 * Color neón único que va cambiando con el tiempo: se mantiene en cada color de
 * la paleta y después pasa al siguiente con un degradado suave.
 *
 * Se inyecta en materiales Lambert: sus texturas actúan como máscaras en escala
 * de grises (blanco = neón pleno, gris oscuro = relleno tenue del mismo tono).
 * Todos los materiales comparten el mismo uniforme, así que basta con llamar a
 * `update()` una vez por fotograma.
 */
export class NeonCycle {
  /** Color actual (espacio lineal). Se puede leer para colorear efectos. */
  readonly color = new THREE.Color();
  private readonly palette: THREE.Color[];
  private readonly uniform = { value: this.color };
  private time = 0;

  /**
   * @param secondsPerColor duración de cada color, incluida su transición.
   * @param transition fracción final de ese tiempo dedicada al degradado (0..1).
   */
  constructor(
    colors: readonly number[],
    private readonly secondsPerColor: number,
    private readonly transition: number,
  ) {
    this.palette = colors.map((c) => new THREE.Color(c));
    this.update(0);
  }

  update(dt: number): void {
    this.time += dt;
    const n = this.palette.length;
    const t = this.time / this.secondsPerColor;
    const i = Math.floor(t) % n;
    const local = t - Math.floor(t);
    // Mantener el color y fundir solo en la parte final, con suavizado.
    const hold = 1 - this.transition;
    const f = THREE.MathUtils.smoothstep(local, hold, 1);
    this.color.copy(this.palette[i]).lerp(this.palette[(i + 1) % n], f);
  }

  /** Aplica el tinte a un material: multiplica el color difuso y el emisivo. */
  apply<M extends THREE.MeshLambertMaterial>(material: M): M {
    material.customProgramCacheKey = () => 'neon-cycle';
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uNeonColor = this.uniform;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uNeonColor;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= uNeonColor;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uNeonColor;');
    };
    return material;
  }
}
