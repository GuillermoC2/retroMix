import { CONFIG } from '../../config';
import { scrollSpeed } from './difficulty';

/**
 * Altura a la que mira la cámara. Sube sola a velocidad creciente (el escenario
 * avanza aunque el jugador se quede quieto) y, si el jugador va por delante,
 * le sigue suavemente. Nunca baja: retroceder acerca al jugador al borde
 * inferior, donde espera la lava.
 */
export class AutoScroll {
  y: number;
  speed = 0;

  constructor(playerY: number) {
    this.y = playerY + CONFIG.camera.lookAhead;
  }

  update(dt: number, meters: number, playerY: number, multiplier: number, advancing: boolean): void {
    this.speed = advancing ? scrollSpeed(meters) * multiplier : 0;
    this.y += this.speed * dt;
    const wanted = playerY + CONFIG.camera.lookAhead;
    if (wanted > this.y) this.y += (wanted - this.y) * (1 - Math.exp(-dt * CONFIG.camera.followSharpness));
  }
}
