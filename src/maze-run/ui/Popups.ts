/** Textos flotantes de puntuación (p. ej. al comer un fantasma) en la posición de pantalla indicada. */
export class Popups {
  readonly root = document.createElement('div');

  constructor(parent: HTMLElement) {
    this.root.className = 'popups';
    parent.appendChild(this.root);
  }

  show(text: string, xPx: number, yPx: number, className = ''): void {
    const e = document.createElement('div');
    e.className = `popup ${className}`;
    e.textContent = text;
    e.style.left = `${xPx}px`;
    e.style.top = `${yPx}px`;
    e.addEventListener('animationend', () => e.remove());
    this.root.appendChild(e);
  }

  dispose(): void {
    this.root.remove();
  }
}
