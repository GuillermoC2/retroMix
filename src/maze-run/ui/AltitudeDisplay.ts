import { CONFIG } from '../../config';
import { JuicyText } from '../../ui/JuicyText';
import { sectionHead } from './Hud';

/**
 * Cifra de altura flotante en la columna del HUD (a la derecha del laberinto),
 * en la parte superior; los puntos van justo debajo.
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
  private recordShift = 0;

  constructor(parent: HTMLElement, bestDistance: number) {
    const cfg = CONFIG.ui.altitude;
    this.root.className = 'altitude';
    parent.appendChild(this.root);
    this.root.appendChild(sectionHead('ALTURA'));
    this.number = new JuicyText(this.root, {
      className: 'altitude-number',
      swayAmplitude: cfg.swayAmplitude,
      swayPeriod: cfg.swayPeriod,
      tiltAmplitude: cfg.tiltAmplitude,
      waveAmplitude: cfg.waveAmplitude,
      origin: 'center',
    });
    this.number.body.style.fontSize = `${cfg.fontSize}px`;
    this.record.className = 'hud-best';
    this.record.innerHTML = `RECORD <b>${bestDistance} M</b>`;
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
   * Centra la cifra en la columna del HUD, a la altura `CONFIG.ui.altitude.screenY`.
   * Si no cabe, se encoge.
   * @param x centro horizontal de la columna.
   * @param available anchura disponible (px).
   */
  anchor(x: number, available: number): void {
    const needed = this.number.naturalWidth * this.number.restScale;
    this.number.fit = needed > 0 ? Math.max(0.3, Math.min(1, available / needed)) : 1;
    const height = this.number.naturalHeight * this.number.restScale * this.number.fit;
    const y = Math.max(CONFIG.ui.layout.margin + height / 2, window.innerHeight * CONFIG.ui.altitude.screenY);
    this.root.style.left = `${Math.round(x)}px`;
    this.root.style.top = `${Math.round(y)}px`;
  }

  update(dt: number): void {
    this.number.update(dt);
    // La escala es una transformación (no afecta al flujo): bajar la línea del récord
    // lo que crece la cifra, sin seguir los rebotes para que no baile.
    // Con el origen en el centro, la cifra crece la mitad hacia abajo.
    const extra = (this.number.naturalHeight * (this.number.currentScale - 1)) / 2;
    this.recordShift = Math.round(extra);
    this.record.style.transform = `translateY(${this.recordShift}px)`;
  }

  /** Borde inferior en pantalla (px), incluido el desplazamiento de la línea del récord. */
  get bottom(): number {
    return this.root.getBoundingClientRect().bottom + this.recordShift;
  }

  dispose(): void {
    this.root.remove();
  }
}
