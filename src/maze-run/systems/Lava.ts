import { CONFIG } from '../../config';
import { lavaSpeed } from './difficulty';

/**
 * Nivel de lava (en filas del laberinto). Sube con velocidad propia creciente
 * según la distancia, sin superar nunca `maxSpeed`.
 *
 * Además persigue una posición objetivo ligada al borde inferior de la pantalla
 * (`chaseY`): si el jugador sube rápido, la lava se queda atrás y desaparece de
 * la vista (sensación de huida), pero recupera terreno de forma exponencial y
 * vuelve en pocos segundos. Nunca se queda más de `maxHidden` filas por debajo.
 * Quedarse quieto sigue siendo mortal: el escenario avanza y la lava con él.
 */
export class Lava {
  y = CONFIG.player.startRow + CONFIG.lava.startOffset;
  speed = 0;
  private delay = CONFIG.lava.startDelay;

  update(dt: number, meters: number, chaseY: number, multiplier: number): void {
    if (this.delay > 0) this.delay -= dt;
    else {
      this.speed = lavaSpeed(meters) * multiplier;
      this.y += this.speed * dt;
    }
    const gap = chaseY - this.y;
    if (gap > 0) this.y += gap * (1 - Math.exp(-dt * CONFIG.lava.catchUpRate));
    this.y = Math.max(this.y, chaseY - CONFIG.lava.maxHidden);
  }

  /** ¿Una entidad centrada en `y` toca la lava? */
  touches(y: number, radius = 0.3): boolean {
    return this.y > y - radius;
  }
}
