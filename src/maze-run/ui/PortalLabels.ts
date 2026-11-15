/**
 * Cartel flotante sobre cada portal abierto (o muro portal cerrado) con el nombre
 * del minijuego al que lleva.
 * @param hint texto pequeño bajo el nombre.
 * @param variant clase extra para dar otro aspecto (p. ej. los muros portal).
 */
export class PortalLabels {
  readonly root = document.createElement('div');
  private labels = new Map<number, HTMLDivElement>();

  constructor(
    parent: HTMLElement,
    private hint = 'PORTAL',
    variant = '',
  ) {
    this.root.className = `portal-labels ${variant}`.trim();
    parent.appendChild(this.root);
  }

  /** Coloca los carteles indicados (en píxeles de pantalla) y quita los demás. */
  sync(items: ReadonlyArray<{ id: number; text: string; x: number; y: number }>): void {
    const seen = new Set<number>();
    for (const item of items) {
      seen.add(item.id);
      let label = this.labels.get(item.id);
      if (!label) {
        label = document.createElement('div');
        label.className = 'portal-label';
        label.innerHTML = `<span class="portal-label-game">${item.text}</span><span class="portal-label-hint">${this.hint}</span>`;
        this.root.appendChild(label);
        this.labels.set(item.id, label);
      }
      label.style.left = `${Math.round(item.x)}px`;
      label.style.top = `${Math.round(item.y)}px`;
    }
    for (const [id, label] of this.labels) {
      if (seen.has(id)) continue;
      label.remove();
      this.labels.delete(id);
    }
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  dispose(): void {
    this.root.remove();
  }
}
