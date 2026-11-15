import { CONFIG } from '../../config';

/**
 * Habilidad DASH: al coger una pluma, el protagonista queda azulado durante
 * `duration` segundos; mientras, con X hace un dash (acelerón corto por el
 * pasillo) que mata a los fantasmas que toca. Tras cada dash hay `cooldown`
 * segundos de recarga.
 */
export class Dash {
  /** Tiempo que queda del estado azulado (con dash disponible). */
  remaining = 0;
  /** Recarga que queda hasta poder volver a hacer un dash. */
  cooldown = 0;
  /** Tiempo que queda del dash en curso (0 = no está en un dash). */
  dashing = 0;

  get active(): boolean {
    return this.remaining > 0;
  }

  get inDash(): boolean {
    return this.dashing > 0;
  }

  /** ¿Se puede hacer un dash ahora? */
  get ready(): boolean {
    return this.active && this.cooldown <= 0 && !this.inDash;
  }

  /** Últimos segundos del estado azulado: parpadea. */
  get warning(): boolean {
    return this.active && this.remaining < CONFIG.abilities.dash.warning;
  }

  /** Empieza (o vuelve a llenar) el estado azulado. */
  grant(duration: number): void {
    this.remaining = Math.max(this.remaining, duration);
  }

  /** Intenta empezar un dash. @returns si ha empezado. */
  tryDash(): boolean {
    if (!this.ready) return false;
    const { dashTime, cooldown } = CONFIG.abilities.dash;
    this.dashing = dashTime;
    this.cooldown = cooldown;
    return true;
  }

  update(dt: number): void {
    this.remaining = Math.max(0, this.remaining - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.dashing = Math.max(0, this.dashing - dt);
  }

  clear(): void {
    this.remaining = 0;
    this.cooldown = 0;
    this.dashing = 0;
  }
}
