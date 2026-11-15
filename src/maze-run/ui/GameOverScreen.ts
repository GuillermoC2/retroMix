import type { RecordEntry } from '../../core/Records';
import { PopWindow } from '../../ui/PopWindow';
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

/** Cuándo empieza a contar cada cifra (s desde que aparece la ventana) y cuánto tarda. */
const TALLY_START = 0.55;
const TALLY_STAGGER = 0.35;
const TALLY_TIME = 0.7;

const el = (tag: string, className: string, text = ''): HTMLElement => {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
};

interface Stat {
  value: HTMLElement;
  badge: HTMLElement | null;
  target: number;
  unit: string;
  start: number;
  done: boolean;
}

/**
 * Pantalla de fin de partida: una ventana que entra con rebote (`PopWindow`),
 * el título cae letra a letra, las cifras cuentan hacia arriba una tras otra y,
 * si hay récord, su distintivo salta al terminar la cuenta. Abajo, los mejores
 * resultados y la tecla para reiniciar.
 */
export class GameOverScreen {
  readonly root = el('div', 'game-over');
  private pop: PopWindow;
  private stats: Stat[] = [];
  private time = 0;

  constructor(parent: HTMLElement, data: GameOverData) {
    const box = el('div', 'go-box');
    const title = el('div', 'go-title');
    [...'GAME OVER'].forEach((ch, i) => {
      const letter = el('span', 'go-char', ch);
      letter.style.setProperty('--i', String(i));
      title.append(letter);
    });
    const stats = el('div', 'go-stats');
    stats.append(
      this.stat('ALTURA', data.meters, ' M', data.newRecord.distance, 0),
      this.stat('PUNTOS', data.score, '', data.newRecord.score, 1),
    );
    const best = el('div', 'go-best');
    best.innerHTML = `MEJOR ALTURA <b>${data.records.bestDistance} M</b><i></i>MEJOR PUNTUACION <b>${data.records.bestScore}</b>`;
    const restart = el('div', 'go-restart');
    restart.append(el('span', 'key', 'ENTER'), el('span', 'go-restart-text', 'REINICIAR'));
    box.append(title, el('div', 'go-cause', CAUSES[data.cause](data)), stats, best, restart);
    this.root.appendChild(box);
    parent.appendChild(this.root);
    this.pop = new PopWindow(box, this.root);
  }

  private stat(label: string, target: number, unit: string, isRecord: boolean, index: number): HTMLElement {
    const row = el('div', 'go-row');
    const value = el('b', 'go-value', `0${unit}`);
    const badge = isRecord ? el('em', 'go-new', '¡NUEVO RECORD!') : null;
    row.append(el('span', 'go-label', label), el('i', 'go-dots'));
    if (badge) row.append(badge);
    row.append(value);
    this.stats.push({ value, badge, target, unit, start: TALLY_START + index * TALLY_STAGGER, done: false });
    return row;
  }

  update(dt: number): void {
    this.time += dt;
    this.pop.update(dt);
    for (const s of this.stats) {
      if (s.done || this.time < s.start) continue;
      const k = Math.min(1, (this.time - s.start) / TALLY_TIME);
      // Cuenta rápida al principio y frena al llegar.
      const shown = Math.round(s.target * (1 - (1 - k) ** 3));
      s.value.textContent = `${shown}${s.unit}`;
      if (k >= 1) {
        s.done = true;
        s.value.classList.add('done');
        s.badge?.classList.add('show');
        if (s.badge) this.pop.kick(1.5, 0.05);
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
