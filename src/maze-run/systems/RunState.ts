import { CONFIG } from '../../config';
import { Emitter } from '../../core/Events';

/**
 * `portal`: el jugador está siendo absorbido por un portal (o jugando el minijuego, con el modo en pausa).
 * `cinematic`: animación de recibir un poder especial (la partida está congelada).
 */
export type RunPhase = 'ready' | 'playing' | 'portal' | 'cinematic' | 'dying' | 'over';
export type DeathCause = 'ghost' | 'lava' | 'minigame';

export type RunEvents = {
  /** Se han sumado puntos en una posición del laberinto (casillas). */
  score: { amount: number; x: number; y: number; showPopup: boolean };
  /** Nuevo máximo de metros alcanzado. */
  meters: number;
  energizer: { duration: number };
  /** Se ha abierto un túnel en un muro (casillas abiertas). */
  wallBroken: { tiles: ReadonlyArray<{ x: number; y: number }> };
  died: { cause: DeathCause };
  /** Se ha entrado en un portal hacia el minijuego indicado. */
  portalEntered: { game: string };
  /** Resultado del minijuego al volver al laberinto. */
  minigameResult: { game: string; won: boolean };
  /** Empieza o termina un poder especial. */
  specialPower: { id: string; active: boolean };
  /** Se ha tocado un muro portal (entra en su minijuego). */
  gateEntered: { game: string };
  /** Se ha comprado una habilidad en la tienda (los puntos ya se han descontado). */
  abilityBought: { id: string; tier: string; price: number };
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

  /** Gasta puntos (tienda de habilidades). @returns false si no hay suficientes. */
  spend(amount: number): boolean {
    if (this.score < amount) return false;
    this.score -= amount;
    return true;
  }

  reachRow(row: number): void {
    if (row <= this.bestRow) return;
    this.bestRow = row;
    this.events.emit('meters', this.meters);
  }
}
