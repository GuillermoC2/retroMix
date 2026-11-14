import { CONFIG } from '../../config';
import { lavaSpeed } from './difficulty';

/**
 * Nivel de lava (en filas del laberinto). Sube con velocidad propia creciente
 * según la distancia, sin superar nunca `maxSpeed`, y además nunca queda por
 * debajo de `minY` (el borde inferior de la pantalla): así el avance del
 * escenario la arrastra hacia arriba y obliga a no quedarse quieto.
 */
export class Lava {
  y = CONFIG.player.startRow + CONFIG.lava.startOffset;
  speed = 0;
  private delay = CONFIG.lava.startDelay;

  update(dt: number, meters: number, minY: number, multiplier: number): void {
    if (this.delay > 0) this.delay -= dt;
    else {
      this.speed = lavaSpeed(meters) * multiplier;
      this.y += this.speed * dt;
    }
    this.y = Math.max(this.y, minY);
  }

  /** ¿Una entidad centrada en `y` toca la lava? */
  touches(y: number, radius = 0.3): boolean {
    return this.y > y - radius;
  }
}
