import { CONFIG } from '../../config';
import { JuicyText } from '../../ui/JuicyText';

/**
 * Cifra de altura flotante centrada sobre el panel de puntos, a medio camino
 * entre el borde superior de la pantalla y el panel.
 * Reglas de reacción (todas en `CONFIG.ui.altitude`):
 *  - cada metro: micro-pop,
 *  - cada `smallPopEvery` metros: pop algo mayor,
 *  - cada `milestone` metros: crece un escalón, rebota, gira, tiembla,
 *    destella y suelta chispas.
 * Los efectos futuros se añaden aquí (cuándo) y en JuicyText (cómo).
 */
export class AltitudeDisplay {
  private root = document.createElement('div');
  private number: JuicyText;
  private record = document.createElement('div');
  private shown = -1;
  private kickSign = 1;

  constructor(parent: HTMLElement, bestDistance: number) {
    const cfg = CONFIG.ui.altitude;
    this.root.className = 'altitude';
    parent.appendChild(this.root);
    this.number = new JuicyText(this.root, {
      className: 'altitude-number',
      swayAmplitude: cfg.swayAmplitude,
      swayPeriod: cfg.swayPeriod,
      tiltAmplitude: cfg.tiltAmplitude,
      waveAmplitude: cfg.waveAmplitude,
      origin: 'center',
    });
    this.number.body.style.fontSize = `${cfg.fontSize}px`;
    this.record.className = 'altitude-record';
    this.record.textContent = `RECORD ${bestDistance} M`;
    this.root.appendChild(this.record);
    this.setMeters(0);
  }

  setMeters(meters: number): void {
    if (meters === this.shown) return;
    const cfg = CONFIG.ui.altitude;
    const previous = this.shown;
    this.shown = meters;
    this.number.setText(`${meters}M`, (ch) => (ch === 'M' ? 'altitude-unit' : ''));

    const tier = Math.min(Math.floor(meters / cfg.milestone), cfg.maxGrowthSteps);
    this.number.setBaseScale(1 + tier * cfg.growthPerMilestone);
    if (previous < 0) return; // valor inicial: sin efectos

    if (Math.floor(meters / cfg.milestone) > Math.floor(previous / cfg.milestone)) {
      this.kickSign = -this.kickSign;
      this.number.pop(0.4);
      this.number.kick(10 * this.kickSign);
      this.number.shake(7, 0.45);
      this.number.flash('juicy-flash', 320);
      this.number.burst(16);
    } else if (Math.floor(meters / cfg.smallPopEvery) > Math.floor(previous / cfg.smallPopEvery)) {
      this.kickSign = -this.kickSign;
      this.number.pop(0.1);
      this.number.kick(2 * this.kickSign);
    } else {
      this.number.pop(0.025);
    }
  }

  /**
   * Centra la cifra sobre el panel de puntos, a medio camino entre el borde
   * superior y el panel. Si no cabe centrada sin tapar el laberinto, se desplaza
   * hacia la derecha; si tampoco cabe así, se encoge.
   * @param mazeRightPx borde derecho del laberinto a la altura de la cifra.
   * @param panel rectángulo del panel de puntos.
   */
  anchor(mazeRightPx: number, panel: DOMRect): void {
    const { margin, gap } = CONFIG.ui.altitude;
    const W = window.innerWidth;
    const narrow = W < window.innerHeight;
    // En pantallas estrechas el laberinto ocupa todo el ancho: se limita a una fracción de la pantalla.
    const available = narrow ? W * 0.45 : W - mazeRightPx - gap - margin;
    const needed = this.number.naturalWidth * this.number.restScale;
    this.number.fit = needed > 0 ? Math.max(0.3, Math.min(1, available / needed)) : 1;

    const width = needed * this.number.fit;
    const height = this.number.naturalHeight * this.number.restScale * this.number.fit;
    const minX = narrow ? W / 2 : mazeRightPx + gap + width / 2;
    const maxX = W - margin - width / 2;
    const centerX = narrow ? maxX : panel.left + panel.width / 2;
    const x = Math.min(maxX, Math.max(minX, centerX));
    const y = Math.max(margin + height / 2, narrow ? 0 : panel.top / 2);
    this.root.style.left = `${Math.round(x)}px`;
    this.root.style.top = `${Math.round(y)}px`;
  }

  update(dt: number): void {
    this.number.update(dt);
    // La escala es una transformación (no afecta al flujo): bajar la línea del récord
    // lo que crece la cifra, sin seguir los rebotes para que no baile.
    // Con el origen en el centro, la cifra crece la mitad hacia abajo.
    const extra = (this.number.naturalHeight * (this.number.currentScale - 1)) / 2;
    this.record.style.transform = `translateY(${Math.round(extra)}px)`;
  }

  dispose(): void {
    this.root.remove();
  }
}
