import { CONFIG } from '../../config';
import { JuicyText } from '../../ui/JuicyText';
import { sectionHead } from './Hud';

/**
 * Puntuación flotante (sin caja). La cifra cuenta hacia arriba hasta el valor
 * real en lugar de saltar, y reacciona según lo ganado de golpe:
 *  - poco (un punto): micro-pop,
 *  - medio (energizador): pop y giro,
 *  - mucho (fantasma): pop, giro, temblor, destello y chispas.
 * Parámetros en `CONFIG.ui.score`.
 */
export class ScoreDisplay {
  private root = document.createElement('div');
  private number: JuicyText;
  private record = document.createElement('div');
  private target = 0;
  private shown = 0;
  private kickSign = 1;

  constructor(parent: HTMLElement, bestScore: number) {
    const cfg = CONFIG.ui.score;
    this.root.className = 'score';
    parent.appendChild(this.root);

    this.root.appendChild(sectionHead('PUNTOS'));

    this.number = new JuicyText(this.root, {
      className: 'score-number',
      swayAmplitude: cfg.swayAmplitude,
      swayPeriod: cfg.swayPeriod,
      tiltAmplitude: cfg.tiltAmplitude,
      waveAmplitude: cfg.waveAmplitude,
      origin: 'center',
    });
    this.number.body.style.fontSize = `${cfg.fontSize}px`;
    this.number.setText('0');

    this.record.className = 'hud-best';
    this.root.appendChild(this.record);
    this.setBest(bestScore);
  }

  setBest(bestScore: number): void {
    this.record.innerHTML = `RECORD <b>${bestScore}</b>`;
  }

  setScore(score: number): void {
    const gain = score - this.target;
    if (gain < 0) {
      // Puntos gastados (tienda de habilidades): la cifra baja contando y tiembla.
      this.target = score;
      this.number.shake(4, 0.3);
      return;
    }
    if (gain === 0) return;
    this.target = score;
    const cfg = CONFIG.ui.score;
    if (gain >= cfg.bigGain) {
      this.kickSign = -this.kickSign;
      this.number.pop(0.35);
      this.number.kick(9 * this.kickSign);
      this.number.shake(5, 0.35);
      this.number.flash('score-flash', 280);
      this.number.burst(12, 'score-spark');
    } else if (gain >= cfg.mediumGain) {
      this.kickSign = -this.kickSign;
      this.number.pop(0.15);
      this.number.kick(4 * this.kickSign);
    } else {
      this.number.pop(0.04);
    }
  }

  /**
   * @param x centro horizontal de la columna del HUD.
   * @param top borde superior (px).
   * @param available anchura disponible (px); si no cabe, la cifra se encoge.
   */
  anchor(x: number, top: number, available: number): void {
    const needed = this.number.naturalWidth;
    this.number.fit = needed > 0 ? Math.max(0.3, Math.min(1, available / needed)) : 1;
    this.root.style.left = `${Math.round(x)}px`;
    this.root.style.top = `${Math.round(top)}px`;
  }

  update(dt: number): void {
    // Recuento: se acerca al valor real de forma exponencial, en múltiplos de 10 como los puntos.
    if (this.shown !== this.target) {
      this.shown += (this.target - this.shown) * (1 - Math.exp(-dt * CONFIG.ui.score.tallyRate));
      if (Math.abs(this.target - this.shown) < 5) this.shown = this.target;
    }
    this.number.setText(String(Math.round(this.shown / 10) * 10));
    this.number.update(dt);
  }

  dispose(): void {
    this.root.remove();
  }
}
