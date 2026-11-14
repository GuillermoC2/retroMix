import { CONFIG, type SpecialPowerId } from '../../config';
import type { Rng } from '../../core/Rng';

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
    if (a.elapsed < a.duration + this.tailTime(a.id)) return null;
    this.active = null;
    return a.id;
  }

  name(id: SpecialPowerId): string {
    return CONFIG.specialPowers[id].name;
  }

  /** ¿El efecto del gigante está en vigor? (no durante la animación de encoger). */
  get giant(): boolean {
    const a = this.active;
    return a?.id === 'giant' && a.elapsed < a.duration;
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

  /** Escala visual del jugador: grande desde el principio, parpadea al final y encoge. */
  get playerScale(): number {
    const a = this.active;
    if (a?.id !== 'giant') return 1;
    const { scale, shrinkTime, warnTime } = CONFIG.specialPowers.giant;
    const t = a.elapsed;
    if (t >= a.duration) {
      const k = Math.min(1, (t - a.duration) / shrinkTime);
      return scale + (1 - scale) * k * k;
    }
    // Aviso: alterna de tamaño en escalones, cada vez más deprisa.
    const left = a.duration - t;
    if (left <= warnTime) {
      const rate = 6 + (1 - left / warnTime) * 8;
      return Math.floor(t * rate) % 2 === 0 ? scale : scale * 0.82;
    }
    return scale;
  }

  /** Tiempo de la animación de salida tras acabar el efecto. */
  private tailTime(id: SpecialPowerId): number {
    return id === 'giant' ? CONFIG.specialPowers.giant.shrinkTime : 0;
  }
}
