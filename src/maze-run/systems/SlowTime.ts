import { CONFIG } from '../../config';

/**
 * TIEMPO LENTO (habilidad legendaria): al coger un reloj de arena, todo menos el
 * protagonista va a cámara lenta un rato (fantasmas, lava y subida del escenario).
 * `scale` es el factor por el que se multiplica el tiempo del mundo; entra y sale
 * suave para que no dé un tirón.
 */
export class SlowTime {
  remaining = 0;
  private elapsed = 0;

  get active(): boolean {
    return this.remaining > 0;
  }

  /** Últimos segundos: el aviso en pantalla parpadea. */
  get warning(): boolean {
    return this.active && this.remaining < CONFIG.abilities.slowTime.warning;
  }

  /** Factor de tiempo del mundo: 1 normal, `CONFIG.abilities.slowTime.scale` del todo lento. */
  get scale(): number {
    if (!this.active) return 1;
    const { scale, ease } = CONFIG.abilities.slowTime;
    const blend = Math.min(1, this.elapsed / ease, this.remaining / ease);
    return 1 - (1 - scale) * blend;
  }

  /** Empieza (o vuelve a llenar) la cámara lenta. */
  grant(duration: number): void {
    if (!this.active) this.elapsed = 0;
    this.remaining = Math.max(this.remaining, duration);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.elapsed += dt;
    this.remaining = Math.max(0, this.remaining - dt);
  }

  clear(): void {
    this.remaining = 0;
  }
}
