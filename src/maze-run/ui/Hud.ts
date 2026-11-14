import type { RecordEntry } from '../../core/Records';
import { AltitudeDisplay } from './AltitudeDisplay';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
};

const pad = (n: number, len: number) => String(Math.floor(n)).padStart(len, '0');

/**
 * Marcadores en pantalla. La altura es una cifra flotante en la esquina
 * superior derecha; el panel de puntos se ancla al borde derecho del laberinto
 * (posición proyectada desde el mundo).
 */
export class Hud {
  readonly root = el('div', 'hud');
  private right = el('div', 'hud-panel hud-right');
  private score = el('div', 'hud-score', '000000');
  private bestScore = el('div', 'hud-sub');
  private view = el('div', 'hud-hint');
  private power = el('div', 'hud-power');
  private powerShown = '';
  private message = el('div', 'hud-message');
  private god = el('div', 'hud-god', 'MODO DIOS [K]');
  private shownScore = -1;
  private altitude: AltitudeDisplay;

  constructor(parent: HTMLElement, records: RecordEntry) {
    this.right.append(el('div', 'hud-label', 'PUNTOS'), this.score, this.bestScore, this.power, this.view);
    this.root.append(this.right, this.message, this.god);
    this.setGodMode(false);
    parent.appendChild(this.root);
    this.altitude = new AltitudeDisplay(this.root, records.bestDistance);
    this.bestScore.textContent = `RECORD ${records.bestScore}`;
  }

  setValues(meters: number, score: number): void {
    this.altitude.setMeters(meters);
    if (score !== this.shownScore) {
      this.shownScore = score;
      this.score.textContent = pad(score, 6);
    }
  }

  /** Coloca los paneles junto a los bordes del laberinto (coordenadas de pantalla en px). */
  /**
   * @param mazeRightPx borde derecho del laberinto a la altura del jugador.
   * @param mazeRightTopPx borde derecho del laberinto en lo alto de la pantalla (donde está la cifra).
   */
  anchor(mazeRightPx: number, mazeRightTopPx: number, centerYPx: number): void {
    const w = window.innerWidth;
    this.altitude.anchor(mazeRightTopPx, this.right.getBoundingClientRect());
    this.right.style.left = `${Math.min(w - 8, mazeRightPx + 18)}px`;
    this.right.style.top = `${centerYPx}px`;
  }

  /** Animaciones por fotograma (cifra flotante). */
  update(dt: number): void {
    this.altitude.update(dt);
  }

  /** Cargas del poder romper muro. */
  setPower(charges: number, devInfinite: boolean): void {
    const text = `[ESPACIO] ROMPER MURO
CARGAS ${charges === Infinity ? 'INF' : charges}${devInfinite ? ' (DEV)' : ''}`;
    if (text === this.powerShown) return;
    this.powerShown = text;
    this.power.textContent = text;
    this.power.classList.toggle('empty', charges <= 0);
  }

  /** Destello del indicador al usar el poder. */
  pulsePower(): void {
    this.power.classList.remove('bump');
    void this.power.offsetWidth;
    this.power.classList.add('bump');
  }

  /** Indicador de modo dios (herramienta de desarrollo). */
  setGodMode(on: boolean): void {
    this.god.style.display = on ? '' : 'none';
  }

  setView(name: string): void {
    this.view.textContent = `[C] VISTA ${name}`;
  }

  setMessage(text: string, blink = false): void {
    this.message.textContent = text;
    this.message.classList.toggle('blink', blink);
    this.message.style.display = text ? '' : 'none';
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  dispose(): void {
    this.root.remove();
  }
}
