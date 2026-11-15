import { CONFIG } from '../../config';
import type { Maze } from '../maze/Maze';
import { DX, DY, type Dir } from '../maze/grid';

/** Rayo del láser en coordenadas de casilla: de la boca al muro donde choca. */
export interface LaserBeam {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  dir: Dir;
}

/** Distancia (casillas) del centro del protagonista a su boca, de donde sale el rayo. */
const MOUTH = 0.3;

/**
 * Láser de la habilidad LASER: al comer una bola, el protagonista dispara un
 * rayo continuo por la boca (hacia donde mira) durante unos segundos. El rayo
 * llega hasta el primer muro (o `maxReach` casillas).
 */
export class Laser {
  remaining = 0;
  /** Duración del disparo actual (para la barra/aviso). */
  duration = 0;

  get active(): boolean {
    return this.remaining > 0;
  }

  /** Últimos segundos: el rayo parpadea. */
  get warning(): boolean {
    return this.active && this.remaining < CONFIG.abilities.laser.warning;
  }

  /** Empieza (o vuelve a llenar) el disparo. */
  fire(duration: number): void {
    this.duration = duration;
    this.remaining = Math.max(this.remaining, duration);
  }

  update(dt: number): void {
    this.remaining = Math.max(0, this.remaining - dt);
  }

  clear(): void {
    this.remaining = 0;
  }

  /** Rayo desde la boca de alguien en (x, y) mirando hacia `dir`, hasta la cara del primer muro. */
  beam(maze: Maze, x: number, y: number, dir: Dir): LaserBeam {
    const dx = DX[dir];
    const dy = DY[dir];
    const tx = Math.round(x);
    const ty = Math.round(y);
    let t = 1;
    while (t <= CONFIG.abilities.laser.maxReach && maze.isOpen(tx + dx * t, ty + dy * t)) t++;
    // Cara del muro: media casilla antes del centro de la primera casilla cerrada.
    const along = dx ? tx + dx * (t - 0.5) : ty + dy * (t - 0.5);
    const x0 = x + dx * MOUTH;
    const y0 = y + dy * MOUTH;
    const x1 = dx ? along : x0;
    const y1 = dy ? along : y0;
    // Pegado a un muro: el rayo no sale hacia atrás.
    const backwards = (x1 - x0) * dx + (y1 - y0) * dy < 0;
    return backwards ? { x0, y0, x1: x0, y1: y0, dir } : { x0, y0, x1, y1, dir };
  }
}
