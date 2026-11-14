import * as THREE from 'three';

/** Duración (s) del fundido de entrada y salida de la alerta. */
const ALERT_FADE = 0.2;

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
  /** Multiplicador de la velocidad del ciclo (p. ej. más rápido con un poder). */
  speed = 1;
  /**
   * Alerta: sustituye el ciclo por un parpadeo entre dos colores (p. ej. rojo
   * apagado y rojo intenso). Entra y sale con un fundido breve.
   */
  alert: { dim: THREE.Color; bright: THREE.Color; period: number; duty: number } | null = null;
  private alertMix = 0;
  private alertTime = 0;
  private alertColor = new THREE.Color();

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
    this.time += dt * this.speed;
    const n = this.palette.length;
    const t = this.time / this.secondsPerColor;
    const i = Math.floor(t) % n;
    const local = t - Math.floor(t);
    // Mantener el color y fundir solo en la parte final, con suavizado.
    const hold = 1 - this.transition;
    const f = THREE.MathUtils.smoothstep(local, hold, 1);
    this.color.copy(this.palette[i]).lerp(this.palette[(i + 1) % n], f);
    this.applyAlert(dt);
  }

  private applyAlert(dt: number): void {
    const target = this.alert ? 1 : 0;
    if (target && this.alertMix === 0) this.alertTime = 0; // empieza en el pulso intenso
    this.alertMix = THREE.MathUtils.clamp(this.alertMix + (target ? dt : -dt) / ALERT_FADE, 0, 1);
    if (this.alertMix === 0) return;
    const a = this.alert ?? this.lastAlert;
    if (!a) return;
    this.lastAlert = a;
    this.alertTime += dt;
    const phase = (this.alertTime % a.period) / a.period;
    // Pulso intenso durante `duty` del periodo, con bordes cortos pero suaves.
    const k = THREE.MathUtils.smoothstep(phase, 0, 0.08) * (1 - THREE.MathUtils.smoothstep(phase, a.duty, a.duty + 0.08));
    this.alertColor.copy(a.dim).lerp(a.bright, k);
    this.color.lerp(this.alertColor, this.alertMix);
  }
  private lastAlert: NeonCycle['alert'] = null;

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
