import { CONFIG } from '../../config';
import { PelletType, type Pellet, type Pellets } from './Pellets';

/**
 * Habilidad IMAN: al coger un imán, durante unos segundos los puntos pequeños a
 * menos de `radius` casillas del protagonista se le pegan solos (se comen y
 * puntúan al momento; la vista los hace volar). Los energizadores y los objetos
 * de habilidad no se atraen.
 */
export class Magnet {
  remaining = 0;

  get active(): boolean {
    return this.remaining > 0;
  }

  /** Últimos segundos: el aro parpadea. */
  get warning(): boolean {
    return this.active && this.remaining < CONFIG.abilities.magnet.warning;
  }

  /** Empieza (o vuelve a llenar) el imán. */
  grant(duration: number): void {
    this.remaining = Math.max(this.remaining, duration);
  }

  update(dt: number): void {
    this.remaining = Math.max(0, this.remaining - dt);
  }

  clear(): void {
    this.remaining = 0;
  }

  /** Come los puntos pequeños dentro del radio alrededor de (x, y) y los devuelve. */
  attract(pellets: Pellets, x: number, y: number): Pellet[] {
    const { radius } = CONFIG.abilities.magnet;
    const eaten: Pellet[] = [];
    const r = Math.ceil(radius);
    const cx = Math.round(x);
    const cy = Math.round(y);
    for (let ty = cy - r; ty <= cy + r; ty++) {
      for (let tx = cx - r; tx <= cx + r; tx++) {
        if ((tx - x) ** 2 + (ty - y) ** 2 > radius * radius) continue;
        if (pellets.typeAt(tx, ty) !== PelletType.Dot) continue;
        const p = pellets.eatAt(tx, ty);
        if (p) eaten.push(p);
      }
    }
    return eaten;
  }
}
