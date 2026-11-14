import type { RecordEntry } from '../../core/Records';
import type { DeathCause } from '../systems/RunState';

export interface GameOverData {
  meters: number;
  score: number;
  cause: DeathCause;
  records: RecordEntry;
  newRecord: { distance: boolean; score: boolean };
  /** Nombre del minijuego perdido (si la causa es `minigame`). */
  minigame?: string;
}

const CAUSES: Record<DeathCause, (d: GameOverData) => string> = {
  ghost: () => '¡ATRAPADO POR UN FANTASMA!',
  lava: () => '¡TE ALCANZO LA LAVA!',
  minigame: (d) => `¡HAS PERDIDO AL ${d.minigame ?? 'MINIJUEGO'}!`,
};

/** Pantalla de fin de partida con resultado, récords y cómo reiniciar. */
export class GameOverScreen {
  readonly root = document.createElement('div');

  constructor(parent: HTMLElement, data: GameOverData) {
    this.root.className = 'game-over';
    const cause = CAUSES[data.cause](data);
    const badge = (on: boolean) => (on ? '<span class="new-record">¡NUEVO RECORD!</span>' : '');
    this.root.innerHTML = `
      <div class="go-box">
        <div class="go-title">GAME OVER</div>
        <div class="go-cause">${cause}</div>
        <div class="go-row"><span>ALTURA</span><b>${data.meters} M</b></div>
        ${badge(data.newRecord.distance)}
        <div class="go-row"><span>PUNTOS</span><b>${data.score}</b></div>
        ${badge(data.newRecord.score)}
        <div class="go-records">MEJOR ALTURA ${data.records.bestDistance} M · MEJOR PUNTUACION ${data.records.bestScore}</div>
        <div class="go-restart blink">PULSA ENTER O ESPACIO PARA REINICIAR</div>
      </div>`;
    parent.appendChild(this.root);
  }

  dispose(): void {
    this.root.remove();
  }
}
