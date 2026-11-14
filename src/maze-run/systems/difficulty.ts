import { CONFIG } from '../../config';

/**
 * Curvas de dificultad en función de los metros recorridos.
 * Funciones puras: fáciles de ajustar y de probar.
 */

const ramp = (meters: number, distance: number) => 1 - Math.exp(-Math.max(0, meters) / distance);

export function lavaSpeed(meters: number): number {
  const { startSpeed, maxSpeed, rampDistance } = CONFIG.lava;
  return Math.min(maxSpeed, startSpeed + (maxSpeed - startSpeed) * ramp(meters, rampDistance));
}

export function ghostSpeed(meters: number): number {
  const { baseSpeed, maxSpeed, speedRampDistance } = CONFIG.ghosts;
  return Math.min(maxSpeed, baseSpeed + (maxSpeed - baseSpeed) * ramp(meters, speedRampDistance));
}

export function ghostCount(meters: number): number {
  let count = 0;
  for (const step of CONFIG.ghosts.countByDistance) if (meters >= step.from) count = step.count;
  return count;
}

export function frightDuration(meters: number): number {
  const { frightMax, frightMin, frightRampDistance } = CONFIG.ghosts;
  return frightMax - (frightMax - frightMin) * ramp(meters, frightRampDistance);
}

/** Velocidad a la que el escenario sube solo (filas/s). */
export function scrollSpeed(meters: number): number {
  const { startSpeed, maxSpeed, rampDistance } = CONFIG.scroll;
  return Math.min(maxSpeed, startSpeed + (maxSpeed - startSpeed) * ramp(meters, rampDistance));
}
