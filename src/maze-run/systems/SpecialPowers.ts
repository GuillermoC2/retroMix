import { CONFIG, type SpecialPowerId } from '../../config';
import type { Rng } from '../../core/Rng';
import type { HeroLook } from '../entities/sprites';

interface ActivePower {
  id: SpecialPowerId;
  elapsed: number;
  duration: number;
}

/**
 * Poderes especiales temporales (recompensa de los minijuegos). Solo puede haber
 * uno activo; uno nuevo sustituye al anterior. Las reglas de cada poder las aplica
 * `MazeRunMode` consultando este estado.
 *
 * GIGANTE: es grande (`scale`; crece durante la cinemática, ver `PowerCinematic`),
 * va más rápido y, mientras dura, come muros, fantasmas y puntos. Al final
 * parpadea para avisar y encoge.
 *
 * GHOUL: le salen tentáculos y camina por encima de los muros (`ghoulLift`),
 * rompiendo los bloques que pisa y pisoteando fantasmas. Al final recoge los
 * tentáculos y baja al suelo.
 *
 * Cada poder tiene su efecto (`duration`) y una animación de salida (`outroTime`).
 */
export class SpecialPowers {
  active: ActivePower | null = null;

  /** Elige un poder al azar de los disponibles. */
  pick(rng: Rng): SpecialPowerId {
    return rng.pick(CONFIG.specialPowers.pool);
  }

  activate(id: SpecialPowerId): void {
    this.active = { id, elapsed: 0, duration: CONFIG.specialPowers[id].duration };
  }

  /** Quita el poder activo de golpe, sin animación de salida (p. ej. al recibir otro). */
  clear(): void {
    this.active = null;
  }

  /** Termina el poder activo (pasa a su animación de salida). */
  deactivate(): void {
    const a = this.active;
    if (a && a.elapsed < a.duration) a.elapsed = a.duration;
  }

  /** @returns el poder que acaba de terminar del todo en este fotograma, si alguno. */
  update(dt: number): SpecialPowerId | null {
    const a = this.active;
    if (!a) return null;
    a.elapsed += dt;
    if (a.elapsed < a.duration + CONFIG.specialPowers[a.id].outroTime) return null;
    this.active = null;
    return a.id;
  }

  name(id: SpecialPowerId): string {
    return CONFIG.specialPowers[id].name;
  }

  /** ¿El efecto del poder está en vigor? (no durante su animación de salida). */
  isOn(id: SpecialPowerId): boolean {
    const a = this.active;
    return a?.id === id && a.elapsed < a.duration;
  }

  get giant(): boolean {
    return this.isOn('giant');
  }

  get ghoul(): boolean {
    return this.isOn('ghoul');
  }

  /** Aspecto del protagonista: con máscara mientras dure el GHOUL (incluida su salida). */
  get look(): HeroLook {
    return this.active?.id === 'ghoul' ? 'ghoul' : 'normal';
  }

  /**
   * Progreso de la salida del poder activo: 0 mientras dura el efecto, hasta 1 al
   * acabar la animación de salida.
   */
  get outro(): number {
    const a = this.active;
    if (!a || a.elapsed < a.duration) return 0;
    return Math.min(1, (a.elapsed - a.duration) / CONFIG.specialPowers[a.id].outroTime);
  }

  /** Altura extra del protagonista: el GHOUL va por encima de los muros y baja al acabar. */
  get ghoulLift(): number {
    if (this.active?.id !== 'ghoul') return 0;
    const k = this.outro;
    return CONFIG.specialPowers.ghoul.lift * (1 - k * k);
  }

  /** Fracción de tiempo restante (1 → 0) del poder activo, para el indicador. */
  get remaining(): number {
    const a = this.active;
    return a ? Math.max(0, 1 - a.elapsed / a.duration) : 0;
  }

  /** ¿Está a punto de acabarse? (parpadeo de aviso). */
  get warning(): boolean {
    const a = this.active;
    return !!a && a.elapsed < a.duration && a.duration - a.elapsed <= CONFIG.specialPowers[a.id].warnTime;
  }

  /**
   * Escala visual del jugador: GIGANTE y GHOUL son grandes desde el principio (crecen
   * en la cinemática) y encogen al salir; el GIGANTE además parpadea al final.
   */
  get playerScale(): number {
    const a = this.active;
    if (!a) return 1;
    const scale = a.id === 'giant' ? CONFIG.specialPowers.giant.scale : CONFIG.specialPowers.ghoul.scale;
    const t = a.elapsed;
    if (t >= a.duration) {
      const k = this.outro;
      return scale + (1 - scale) * k * k;
    }
    if (a.id !== 'giant') return scale;
    const { warnTime } = CONFIG.specialPowers.giant;
    // Aviso: alterna de tamaño en escalones, cada vez más deprisa.
    const left = a.duration - t;
    if (left <= warnTime) {
      const rate = 6 + (1 - left / warnTime) * 8;
      return Math.floor(t * rate) % 2 === 0 ? scale : scale * 0.82;
    }
    return scale;
  }
}
