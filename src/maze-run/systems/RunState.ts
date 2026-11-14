import { CONFIG } from '../../config';
import { Emitter } from '../../core/Events';

export type RunPhase = 'ready' | 'playing' | 'dying' | 'over';
export type DeathCause = 'ghost' | 'lava';

export type RunEvents = {
  /** Se han sumado puntos en una posición del laberinto (casillas). */
  score: { amount: number; x: number; y: number; showPopup: boolean };
  /** Nuevo máximo de metros alcanzado. */
  meters: number;
  energizer: { duration: number };
  /** Se ha abierto un túnel en un muro (casillas abiertas). */
  wallBroken: { tiles: ReadonlyArray<{ x: number; y: number }> };
  died: { cause: DeathCause };
};

/**
 * Estado de una partida: fase, puntuación y distancia.
 *
 * `modifiers` es el punto de enganche previsto para que efectos externos
 * (p. ej. el resultado de un futuro minijuego) alteren la partida sin tocar
 * los sistemas: estos multiplican sus velocidades por estos valores.
 */
export class RunState {
  readonly events = new Emitter<RunEvents>();
  phase: RunPhase = 'ready';
  phaseTime = 0;
  score = 0;
  readonly startRow: number = CONFIG.player.startRow;
  bestRow: number = CONFIG.player.startRow;
  deathCause: DeathCause | null = null;

  readonly modifiers = {
    playerSpeed: 1,
    ghostSpeed: 1,
    lavaSpeed: 1,
    scrollSpeed: 1,
  };

  get meters(): number {
    return Math.max(0, this.bestRow - this.startRow) * CONFIG.scoring.metersPerRow;
  }

  setPhase(phase: RunPhase): void {
    this.phase = phase;
    this.phaseTime = 0;
  }

  addScore(amount: number, x: number, y: number, showPopup = false): void {
    this.score += amount;
    this.events.emit('score', { amount, x, y, showPopup });
  }

  reachRow(row: number): void {
    if (row <= this.bestRow) return;
    this.bestRow = row;
    this.events.emit('meters', this.meters);
  }
}
