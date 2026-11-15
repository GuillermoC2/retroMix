import { CONFIG } from '../../config';
import { TOP_DISTANCES } from '../../core/Records';
import { JuicyText } from '../../ui/JuicyText';
import { sectionHead } from './Hud';

interface Row {
  root: HTMLDivElement;
  text: JuicyText;
}

/**
 * Lista de récords de distancia, a la izquierda del laberinto (simétrica a la
 * columna del HUD de la derecha). Las cifras son grandes, casi como la altura de
 * la partida, y flotan con el mismo estilo. Parámetros en `CONFIG.ui.records`.
 */
export class RecordsList {
  private root = document.createElement('div');
  private rows: Row[] = [];

  constructor(parent: HTMLElement, distances: number[]) {
    const cfg = CONFIG.ui.records;
    this.root.className = 'records';
    const title = sectionHead('RECORDS');
    title.classList.add('records-title');
    this.root.appendChild(title);

    for (let i = 0; i < TOP_DISTANCES; i++) {
      const root = document.createElement('div');
      root.className = `records-row rank-${i + 1}`;
      const rank = document.createElement('div');
      rank.className = 'records-rank';
      rank.textContent = `${i + 1}`;
      root.appendChild(rank);
      const text = new JuicyText(root, {
        className: 'records-number',
        swayAmplitude: cfg.swayAmplitude,
        swayPeriod: cfg.swayPeriod,
        tiltAmplitude: cfg.tiltAmplitude,
        waveAmplitude: cfg.waveAmplitude,
        origin: 'center right',
      });
      text.body.style.fontSize = `${cfg.fontSize}px`;
      this.root.appendChild(root);
      this.rows.push({ root, text });
    }
    parent.appendChild(this.root);
    this.set(distances);
  }

  /**
   * @param distances mejores distancias, de mayor a menor.
   * @param highlight puesto que se acaba de conseguir (se resalta), o -1.
   */
  set(distances: number[], highlight = -1): void {
    this.rows.forEach((row, i) => {
      const d = distances[i];
      row.root.classList.toggle('empty', d === undefined);
      row.text.setText(d === undefined ? '---' : `${d}M`, (ch) => (ch === 'M' ? 'altitude-unit' : ''));
      row.root.classList.toggle('new', i === highlight);
      if (i === highlight) {
        row.text.pop(0.4);
        row.text.shake(6, 0.45);
        row.text.burst(16);
      }
    });
  }

  /**
   * Centra la lista entre el borde izquierdo de la pantalla y el del laberinto.
   * Si no cabe (de ancho o de alto), se encoge.
   * @param x centro horizontal del hueco.
   * @param available anchura disponible (px).
   */
  anchor(x: number, available: number): void {
    const cfg = CONFIG.ui.records;
    const { margin } = CONFIG.ui.layout;
    const w = this.root.offsetWidth;
    const h = this.root.offsetHeight;
    const maxHeight = window.innerHeight * cfg.maxHeight;
    const fit = w > 0 && h > 0 ? Math.max(0.3, Math.min(1, available / w, maxHeight / h)) : 1;
    const top = Math.max(margin, window.innerHeight * cfg.screenY);
    this.root.style.left = `${Math.round(x)}px`;
    this.root.style.top = `${Math.round(top)}px`;
    this.root.style.transform = `translateX(-50%) scale(${fit.toFixed(3)})`;
  }

  update(dt: number): void {
    for (const row of this.rows) row.text.update(dt);
  }

  dispose(): void {
    this.root.remove();
  }
}
