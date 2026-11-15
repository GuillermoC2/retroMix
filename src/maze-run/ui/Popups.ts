/** Tamaño de los puntos según lo ganado; desde 400 (fantasmas seguidos) además van en arcoíris. */
const SCORE_TIERS: ReadonlyArray<{ from: number; className: string }> = [
  { from: 1600, className: 'tier-4' },
  { from: 800, className: 'tier-3' },
  { from: 400, className: 'tier-2' },
  { from: 200, className: 'tier-1' },
];

/**
 * Mensajes flotantes sobre el laberinto, en la posición de pantalla indicada:
 *  - `score`: puntos ganados (neón con halo; en arcoíris y más grandes con fantasmas seguidos),
 *  - `tag`: etiqueta de lo que acaba de pasar (objeto cogido, uso ganado…), con el color de su origen,
 *  - `fail`: algo no se ha podido hacer (etiqueta roja, o una X si no hay texto).
 * Todos entran con rebote, se quedan un momento y suben desvaneciéndose.
 */
export class Popups {
  readonly root = document.createElement('div');

  constructor(parent: HTMLElement) {
    this.root.className = 'popups';
    parent.appendChild(this.root);
  }

  score(amount: number, xPx: number, yPx: number): void {
    const tier = SCORE_TIERS.find((t) => amount >= t.from)?.className ?? 'tier-0';
    this.add(`popup popup-score ${tier}`, String(amount), xPx, yPx);
  }

  /** @param color color de la etiqueta (CSS). */
  tag(text: string, xPx: number, yPx: number, color: string): void {
    const e = this.add('popup popup-tag', text, xPx, yPx);
    e.style.setProperty('--c', color);
  }

  fail(xPx: number, yPx: number, text = ''): void {
    if (text) this.add('popup popup-tag popup-denied', text, xPx, yPx);
    else this.add('popup popup-fail', 'X', xPx, yPx);
  }

  private add(className: string, text: string, xPx: number, yPx: number): HTMLElement {
    const e = document.createElement('div');
    e.className = className;
    e.textContent = text;
    e.style.left = `${Math.round(xPx)}px`;
    e.style.top = `${Math.round(yPx)}px`;
    e.addEventListener('animationend', () => e.remove());
    this.root.appendChild(e);
    return e;
  }

  dispose(): void {
    this.root.remove();
  }
}
