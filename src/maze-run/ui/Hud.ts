import type { RecordEntry } from '../../core/Records';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
};

const pad = (n: number, len: number) => String(Math.floor(n)).padStart(len, '0');

/**
 * Marcadores en pantalla. El panel de metros se ancla al borde izquierdo del
 * laberinto (posición proyectada desde el mundo) y el de puntos al derecho.
 */
export class Hud {
  readonly root = el('div', 'hud');
  private left = el('div', 'hud-panel hud-left');
  private right = el('div', 'hud-panel hud-right');
  private meters = el('div', 'hud-meters', '0000');
  private score = el('div', 'hud-score', '000000');
  private bestMeters = el('div', 'hud-sub');
  private bestScore = el('div', 'hud-sub');
  private view = el('div', 'hud-hint');
  private power = el('div', 'hud-power');
  private powerShown = '';
  private message = el('div', 'hud-message');
  private shown = { meters: -1, score: -1 };

  constructor(parent: HTMLElement, records: RecordEntry) {
    const metersRow = el('div', 'hud-meters-row');
    metersRow.append(this.meters, el('span', 'hud-unit', 'M'));
    this.left.append(el('div', 'hud-label', 'ALTURA'), metersRow, this.bestMeters);
    this.right.append(el('div', 'hud-label', 'PUNTOS'), this.score, this.bestScore, this.power, this.view);
    this.root.append(this.left, this.right, this.message);
    parent.appendChild(this.root);
    this.bestMeters.textContent = `RECORD ${records.bestDistance} M`;
    this.bestScore.textContent = `RECORD ${records.bestScore}`;
  }

  setValues(meters: number, score: number): void {
    if (meters !== this.shown.meters) {
      const milestone = Math.floor(meters / 10) > Math.floor(this.shown.meters / 10) && this.shown.meters >= 0;
      this.shown.meters = meters;
      this.meters.textContent = pad(meters, 4);
      if (milestone) {
        this.meters.classList.remove('bump');
        void this.meters.offsetWidth; // reinicia la animación CSS
        this.meters.classList.add('bump');
      }
    }
    if (score !== this.shown.score) {
      this.shown.score = score;
      this.score.textContent = pad(score, 6);
    }
  }

  /** Coloca los paneles junto a los bordes del laberinto (coordenadas de pantalla en px). */
  anchor(mazeLeftPx: number, mazeRightPx: number, centerYPx: number): void {
    const w = window.innerWidth;
    this.left.style.right = `${Math.max(8, w - mazeLeftPx + 18)}px`;
    this.right.style.left = `${Math.min(w - 8, mazeRightPx + 18)}px`;
    this.left.style.top = this.right.style.top = `${centerYPx}px`;
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
