import { CONFIG } from '../../config';
import type { GameContext } from '../../core/Game';
import type { GameMode } from '../../core/ModeStack';
import { JuicyText } from '../../ui/JuicyText';
import { PixelFire } from '../../ui/PixelFire';
import { PopWindow } from '../PopWindow';
import type { MinigameResult, MinigameStakes } from '../types';
import { PongGame, type PongSide } from './PongGame';
import { PongScene } from './PongScene';
import { PONG_THEMES, type PongTheme } from './themes';

/** Tiempo mínimo mostrando el resultado antes de poder saltarlo con Enter o Espacio. */
const MIN_RESULT_TIME = 0.8;
/** Proporción ancho/alto de la pantalla del juego (la pista se ve en perspectiva y pide algo más de ancho). */
const SCREEN_ASPECT = 1.6;

/**
 * Pong 2.5D en una ventana sobre el laberinto pausado. La lógica está en
 * `PongGame`, la pista 3D en `PongScene` y la ventana animada en `PopWindow`;
 * aquí van los textos, el teclado y las reacciones a los eventos.
 *
 * Según la entrada (`stakes.kind`): en un muro portal gana el primer punto y
 * se ve con los colores del laberinto; en un portal de poder especial hacen
 * falta 3 puntos y todo es rojizo, con brasas y los avisos de punto en llamas.
 */
export class PongMode implements GameMode {
  readonly overlay = true;
  private readonly theme: PongTheme;
  private readonly game: PongGame;
  private scene: PongScene | null = null;
  private root = document.createElement('div');
  private win = document.createElement('div');
  private screen = document.createElement('div');
  private canvas = document.createElement('canvas');
  private smallText = document.createElement('div');
  private title!: JuicyText;
  private big!: JuicyText;
  private pop!: PopWindow;
  private lastHits = 0;
  private lastScore = 0;
  private bigShown = '';
  private fire = new PixelFire();
  private leaving = false;
  private finished = false;
  private readonly onResize = () => this.fit();

  constructor(
    private ctx: GameContext,
    private done: (result: MinigameResult) => void,
    private stakes: MinigameStakes,
  ) {
    this.theme = PONG_THEMES[stakes.kind];
    this.game = new PongGame(CONFIG.minigames.pong.pointsToWin[stakes.kind]);
  }

  enter(): void {
    this.root.className = `mg-overlay${this.theme.hard ? ' mg-hard' : ''}`;
    this.win.className = 'mg-window';
    const bar = document.createElement('div');
    bar.className = 'mg-titlebar';
    bar.innerHTML = '<span class="mg-side mg-you">TU</span><span class="mg-side mg-rival">RIVAL</span>';
    const rival = bar.lastElementChild;
    this.title = new JuicyText(bar, { className: 'mg-title', swayAmplitude: 3, swayPeriod: 3.2, tiltAmplitude: 2, waveAmplitude: 2.5 });
    bar.insertBefore(this.title.root, rival);
    this.title.setText('PONG');
    // Las letras del título entran una a una (animación CSS con retraso por letra).
    [...this.title.body.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)));

    this.canvas.className = 'mg-canvas';
    this.screen.className = 'mg-screen';
    this.smallText.className = 'mg-small';
    this.screen.append(this.canvas, this.smallText);
    this.big = new JuicyText(this.screen, { className: 'mg-big', swayAmplitude: 4, swayPeriod: 2.2, tiltAmplitude: 3, waveAmplitude: 3 });
    this.win.append(bar, this.screen);
    this.root.appendChild(this.win);
    this.ctx.ui.appendChild(this.root);

    this.scene = new PongScene(this.canvas, this.game, this.theme);
    this.pop = new PopWindow(this.win, this.root);
    window.addEventListener('resize', this.onResize);
    this.fit();
  }

  exit(): void {
    window.removeEventListener('resize', this.onResize);
    this.scene?.dispose();
    this.scene = null;
    this.root.remove();
  }

  update(dt: number): void {
    const { input } = this.ctx;
    const { game } = this;
    this.pop.update(dt);
    this.title.update(dt);
    this.big.update(dt);
    this.scene?.update(dt);
    this.fire.update(dt);

    if (this.leaving) {
      if (this.pop.gone && !this.finished) this.finish();
      return;
    }

    const held = input.latestHeld(['up', 'down']);
    game.update(dt, held === 'up' ? -1 : held === 'down' ? 1 : 0);

    if (game.hits !== this.lastHits) {
      this.lastHits = game.hits;
      // Tras el golpe la bola ya va hacia el otro lado.
      const side: PongSide = game.ball.vx > 0 ? 'player' : 'ai';
      this.scene?.hit(side);
      this.pop.kick(side === 'player' ? 0.5 : -0.5, 0.015);
      this.bump('mg-hit', this.screen);
    }
    const scored = game.score.player + game.score.ai;
    if (scored !== this.lastScore) {
      this.lastScore = scored;
      const by = game.lastPoint!;
      this.scene?.point(by);
      this.pop.kick(by === 'player' ? -2.5 : 2.5, 0.12);
      this.pop.shake(this.theme.hard ? 6 : 4, 0.35);
    }
    this.updateTexts();

    if (game.phase === 'over') {
      const t = game.phaseTime;
      if (t >= game.cfg.resultTime || (t >= MIN_RESULT_TIME && input.pressed('confirm'))) {
        this.leaving = true;
        this.pop.leave(game.winner === 'player');
      }
    }
  }

  private finish(): void {
    this.finished = true;
    const won = this.game.winner === 'player';
    this.ctx.modes.pop();
    this.done({ won });
  }

  private updateTexts(): void {
    const { game } = this;
    let big = '';
    let small = '';
    let tone = '';
    switch (game.phase) {
      case 'countdown':
        big = String(Math.max(1, Math.ceil(game.cfg.countdown - game.phaseTime)));
        small = this.goalText();
        break;
      case 'play':
        if (game.phaseTime < 0.45 && game.score.player + game.score.ai === 0) big = '¡YA!';
        break;
      case 'point':
        big = game.lastPoint === 'player' ? '¡PUNTO!' : 'PUNTO RIVAL';
        tone = game.lastPoint === 'player' ? 'good' : 'bad';
        break;
      case 'over': {
        const won = game.winner === 'player';
        big = won ? '¡HAS GANADO!' : 'HAS PERDIDO';
        small = won ? this.stakes.wonText : 'FIN DE LA PARTIDA';
        tone = won ? 'good' : 'bad';
        break;
      }
    }
    if (big !== this.bigShown) {
      this.bigShown = big;
      this.big.setText(big);
      this.big.root.dataset.tone = tone;
      // En el portal difícil, los avisos de quién ha marcado salen en llamas.
      const onFire = this.theme.hard && !!big && (game.phase === 'point' || game.phase === 'over');
      this.big.root.classList.toggle('mg-fire', onFire);
      // Las letras se quedan quietas sobre su fuego (que nace de su forma).
      this.big.wave = onFire ? 0 : 1;
      if (onFire) this.fire.attach(this.big.body);
      else this.fire.detach();
      if (big) {
        const strong = game.phase === 'point' || game.phase === 'over';
        this.big.pop(strong ? 0.9 : 0.5);
        this.big.kick((Math.random() < 0.5 ? -1 : 1) * (strong ? 12 : 6));
        if (strong) this.big.shake(5, 0.3);
        if (game.phase === 'over' && game.winner === 'player') this.big.burst(18, this.theme.hard ? 'mg-spark-fire' : '');
      }
    }
    if (this.smallText.textContent !== small) {
      this.smallText.textContent = small;
      if (small) this.bump('mg-small-pop', this.smallText);
    }
  }

  /** Condición de la partida para la cuenta atrás, p. ej. "GANAS CON 1 PUNTO · PIERDES CON 3". */
  private goalText(): string {
    const { player, ai } = this.game.pointsToWin;
    const pts = (n: number) => `${n} PUNTO${n === 1 ? '' : 'S'}`;
    return `GANAS CON ${pts(player)} · PIERDES CON ${ai}`;
  }

  /** Reinicia una animación CSS de un solo uso. */
  private bump(className: string, el: HTMLElement): void {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  /**
   * Tamaño de la pantalla: el framebuffer tiene píxeles del mismo tamaño que los
   * del laberinto y el canvas se escala por CSS a un múltiplo exacto.
   */
  private fit(): void {
    const pixel = this.ctx.renderer.pixelScale / window.devicePixelRatio;
    const cssW = Math.min(window.innerWidth * 0.74, window.innerHeight * 0.64 * SCREEN_ASPECT);
    const w = Math.max(96, Math.floor(cssW / pixel));
    const h = Math.round(w / SCREEN_ASPECT);
    this.canvas.style.width = `${w * pixel}px`;
    this.canvas.style.height = `${h * pixel}px`;
    this.scene?.setSize(w, h);
    this.root.style.setProperty('--mg-scale', ((w * pixel) / this.game.width).toFixed(2));
  }

  render(): void {
    this.scene?.render();
  }
}
